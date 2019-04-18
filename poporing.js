/*

    Poporing.js

    Poporing Life Single Item Data Resolve Library

 */

const winston = require('winston');
const axios = require('axios');
const numeral = require('numeral');
const formatDistance = require('date-fns/formatDistance');
const Fuse = require('fuse.js');
const Redis = require('redis');
const sprintf = require('sprintf-js').sprintf;
const promisify = require('util').promisify;

const default_response_template = {
    SERVER_ERROR: "%1$s %2$s : Server Error, Please try again later",
    NOT_FOUND: "%1$s not found!",
    FOOTNOTE: "Last Price from: %1$s",

    CMD_SETTING_MY_GLOBAL: "Default Server for %1$s set to Global",
    CMD_SETTING_MY_SEA: "Default Server for %1$s set to SEA",
    CMD_SETTING_MY_AUTO: "Default Server for %1$s set to Channel's Default",

    CMD_SETTING_CHANNEL_GLOBAL: "Default Server for this Channel set to Global",
    CMD_SETTING_CHANNEL_SEA: "Default Server for this Channel set to SEA",
    CMD_SETTING_CHANNEL_AUTO: "Default Server for this Channel set to Discord's Default",

    CMD_SETTING_DM_GLOBAL: "Default Server for this DM Channel set to Global",
    CMD_SETTING_DM_SEA: "Default Server for this DM Channel set to SEA",

    CMD_SETTING_SERVER_GLOBAL: "Default Server for this Discord set to Global",
    CMD_SETTING_SERVER_SEA: "Default Server for this Discord set to SEA",

    CMD_HELP_USER_DM: "Just @ the bot follow by item name to get it latest price, prepend s/ or g/ to specify the server, or use command below to change a default one\n\ncmd/myserver=global Set default server for you to Global Server\ncmd/myserver=sea Set default server for you to SEA Server\ncmd/myserver=auto Set default server for your to Channel's Default",
    CMD_HELP_USER_CHANNEL: "Just @ the bot follow by item name to get it latest price, prepend s/ or g/ to specify the server, or use command below to change a default one\n\ncmd/myserver=global Set default server for you to Global Server\ncmd/myserver=sea Set default server for you to SEA Server\ncmd/myserver=auto Set default server for your to Channel's Default",
    CMD_HELP_ADMIN_CHANNEL: "Just @ the bot follow by item name to get it latest price, prepend s/ or g/ to specify the server, or use command below to change a default one\n\ncmd/myserver=global Set default server for you to Global Server\ncmd/myserver=sea Set default server for you to SEA Server\ncmd/myserver=auto Set default server for your to Channel's Default",
    CMD_HELP_ADMIN_SERVER: "Just @ the bot follow by item name to get it latest price, prepend s/ or g/ to specify the server, or use command below to change a default one\n\ncmd/myserver=global Set default server for you to Global Server\ncmd/myserver=sea Set default server for you to SEA Server\ncmd/myserver=auto Set default server for your to Channel's Default",
};

const sample_request = {
    data: {
        user_id: "",    // requried
        channel_id: "", // requried, please use dm-{user_id} if dm channel_id is not available by bot
        server_id: "",  // optional

        user_display_name: "", // optional

        activation: "dm",
        query: "awakening potion",

        is_direct: false,
        is_admin: false,

        default_server: null,

        raw: {},
    },
    response_template: default_response_template,
    replyText: (text, request) => {
    },
    replyPriceData: (data, request) => {
    },
};

const cb_redis_client = Redis.createClient(process.env.REDIS_URL);
const redis_client = {
    get: (key) => new Promise((resolve, reject) => {
        cb_redis_client.get(key, (err, response) => {
            if (err) reject(err);
            resolve(response);
        })
    }),
    set: (key, value) => new Promise((resolve, reject) => {
        cb_redis_client.set(key, value, (err, response) => {
            if (err) reject(err);
            resolve(response);
        })
    }),
};

const fromTimestamp = (timestamp) => new Date(timestamp * 1000);
const getCurrentTimestamp = () => new Date().getTime() / 1000;

// Configure logger settings
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.combine(
        winston.format.colorize(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
    ]
});

let item_list = [];
let fuse = null;
let fuse_tokenize = null;
let fuzzy_search = (s) => s.indexOf(" ") >= 0 ? fuse_tokenize.search(s) : fuse.search(s);

const setup = async () => {
    logger.info('Fetching Item List');
    let response = null;
    try {
        response = await axios.get("https://api.poporing.life/get_item_list?includeRefine=1", {
            headers: {
                "Origin": "https://poporing.life",
                "User-Agent": "PoporingBot-01282019",
            }
        });
    } catch (e) {
        return false;
    }
    logger.info('Fetching List fetched');
    item_list = response.data.data.item_list.map(
        r => Object.assign(
            {},
            r,
            {
                display_name_combined: [].concat([r.display_name], r.alt_display_name_list).join("|").toLowerCase(),
            },
        )
    );
    item_list.sort((a, b) => a.display_name.length - b.display_name.length);
    var options = {
        shouldSort: true,
        tokenize: false,
        matchAllTokens: true,
        threshold: 0.6,
        location: 0,
        distance: 100,
        maxPatternLength: 32,
        minMatchCharLength: 1,
        keys: [
            "name",
            "display_name",
            "alt_display_name_list"
        ]
    };
    fuse = new Fuse(item_list, options); // "list" is the item array
    var options_tokenize = {
        shouldSort: true,
        tokenize: true,
        matchAllTokens: true,
        threshold: 0.6,
        location: 0,
        distance: 20,
        maxPatternLength: 32,
        minMatchCharLength: 1,
        keys: [
            "name",
            "display_name",
            "alt_display_name_list"
        ]
    };
    fuse_tokenize = new Fuse(item_list, options_tokenize); // "list" is the item array
    logger.info('Fuzzy Search prepared');
    return true;
};

const resolve = async (request) => {
    const r = request.data;

    if (!r.query) return;

    let query = r.query;

    let server = r.default_server;

    const has_slash = query.indexOf("/");
    if (has_slash >= 0) {
        const splitted = query.split("/", 2);
        server = splitted[0].trim();
        query = splitted[1].trim();
    }

    let channel_setting = null;
    let server_setting = null;

    if (r.server_id) {
        server_setting = await redis_client.get('s.' + r.server_id);
    }
    if (r.channel_id) {
        channel_setting = await redis_client.get('c.' + r.channel_id);
    }

    const personal_setting = await redis_client.get('c.' + r.user_id);

    let default_server = null;
    if (!default_server && personal_setting) default_server = personal_setting.toString();
    if (default_server === "auto") default_server = null;
    if (!default_server && channel_setting) default_server = channel_setting.toString();
    if (default_server === "auto") default_server = null;
    if (!default_server && server_setting) default_server = server_setting.toString();
    if (default_server === "auto") default_server = null;
    if (!default_server) default_server = "sea";

    if (!server) server = default_server;
    if (server === "s") server = "sea";
    if (server === "g") server = "global";
    if (query === "help") server = "cmd";

    if (server === "sea" || server === "global") {
        const from_params = query.startsWith(":");
        const lower_search_term = query.toLowerCase();
        let show_list = null;

        if (from_params) {
            show_list = item_list.filter(row => ":" + row.name === lower_search_term)[0];
        } else {
            show_list = item_list
                .filter(
                    row => row.display_name_combined.indexOf(lower_search_term) >= 0
                )[0]
        }

        // Do fuzzy search
        if (!show_list) {
            show_list = fuzzy_search(lower_search_term)[0];
        }

        if (!show_list) {
            logger.log('info', {
                type: "DISCORD_BOT_QUERY_FAIL",
                error: "Not Found",
                query,
                server,
                request: r,
            });
            const reply = sprintf(default_response_template.NOT_FOUND, query);
            if (request.replyText) await request.replyText.call(request, reply, request);
            return false;
        }

        const item_name = show_list.name;

        const api = "https://" + (server === "sea" ? "api" : "api-global") + ".poporing.life/get_latest_price/" + item_name;
        const api_origin = "https://" + (server === "sea" ? "" : "global.") + "poporing.life";

        const server_icon = server === "sea" ? "[SEA] " : "[Global] ";
        const server_url = server === "sea" ? "https://poporing.life/?search=:" : "https://global.poporing.life/?search=:";

        let response = null;

        try {
            response = await axios.get(api, {
                headers: {
                    "Origin": api_origin,
                    "User-Agent": "PoporingBot-01282019",
                }
            });
        } catch (e) {
            logger.log('info', {
                type: "DISCORD_BOT_QUERY_FAIL",
                error: "API Error",
                error_obj: e,
                query,
                server,
                request: r,
            });
            const reply = sprintf(default_response_template.SERVER_ERROR, server_icon, show_list.display_name);
            if (request.replyText) await request.replyText.call(request, reply, request);
            return false;
        }

        const item_data = response.data.data.data;
        let price = item_data.price;
        let volume = item_data.volume;
        let timestamp = item_data.timestamp;
        let footnote = "";

        if (!timestamp) {
            price = "Unknown";
            volume = "Unknown";
            timestamp = "-";
        } else {
            if (price === 0) {
                if (item_data.last_known_price === 0) {
                    price = "Unknown";
                } else {
                    price = numeral(item_data.last_known_price).format("0,0");
                    price_relative = formatDistance(fromTimestamp(item_data.last_known_timestamp), new Date());
                    footnote = sprintf(default_response_template.FOOTNOTE, price_relative);
                }
            } else {
                price = numeral(price).format("0,0")
            }
            if (volume < 0) {
                volume = "Unknown";
            } else {
                volume = numeral(volume).format("0,0")
            }
            timestamp = formatDistance(fromTimestamp(timestamp), new Date())
        }

        let image_url = show_list.image_url;
        if (image_url) {
            if (image_url.startsWith("http")) {
                // noinspection SillyAssignmentJS
                image_url = image_url;
            } else {
                image_url = "https://static.poporing.life/items/" + image_url;
            }
        } else {
            image_url = "https://via.placeholder.com/50x50?text=?";
        }
        // logger.info(server_icon + " " + show_list.display_name + " / Price = " + price + " / Volume = " + volume + " / Last Update " + timestamp + " / " + footnote);
        logger.log('info', {
            type: "DISCORD_BOT_QUERY_DONE",
            item_name,
            display_name: show_list.display_name,
            query,
            server,
            request: r,
        });

        const color_hex = server === "sea" ? "#0088dd" : "#FFFF00";
        const color_int = server === "sea" ? 35037 : 16776960;

        const return_data = {

            display_name: show_list.display_name,
            price,
            volume,
            timestamp,
            footnote,
            url: server_url + item_name,
            image_url: image_url,

            server,
            server_icon,
            server_color_hex: color_hex,
            server_color_int: color_int,

        };

        if (request.replyPriceData) await request.replyPriceData.call(request, return_data, request);
        return return_data;

    } else if (server === "cmd") {
        let admin_permission = r.is_admin;
        let cmd_done = false;
        let reply = "";
        switch (query.toLowerCase()) {
            case "myserver=global":
                redis_client.set("u." + r.user_id, "global");
                cmd_done = true;
                reply = sprintf(default_response_template.CMD_SETTING_MY_GLOBAL, r.user_display_name);
                if (request.replyText) await request.replyText.call(request, reply, request);
                break;
            case "myserver=sea":
                redis_client.set("u." + r.user_id, "sea");
                cmd_done = true;
                reply = sprintf(default_response_template.CMD_SETTING_MY_SEA, r.user_display_name);
                if (request.replyText) await request.replyText.call(request, reply, request);
                break;
            case "myserver=auto":
                redis_client.set("u." + r.user_id, "auto");
                cmd_done = true;
                reply = sprintf(default_response_template.CMD_SETTING_MY_AUTO, r.user_display_name);
                if (request.replyText) await request.replyText.call(request, reply, request);
                break;
            case "channel=global":
                if (admin_permission && !r.is_direct) {
                    redis_client.set("c." + r.channel_id, "global");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_CHANNEL_GLOBAL);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "channel=sea":
                if (admin_permission && !r.is_direct) {
                    redis_client.set("c." + r.channel_id, "sea");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_CHANNEL_SEA);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "channel=auto":
                if (admin_permission && !r.is_direct) {
                    redis_client.set("c." + r.channel_id, "auto");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_CHANNEL_AUTO);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "dm=global":
                if (admin_permission && r.is_direct) {
                    redis_client.set("c." + r.channel_id, "global");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_DM_GLOBAL);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "dm=sea":
                if (admin_permission && r.is_direct) {
                    redis_client.set("c." + r.channel_id, "sea");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_DM_SEA);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "default=global":
                if (admin_permission) {
                    redis_client.set("s." + r.server_id, "global");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_SERVER_GLOBAL);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "default=sea":
                if (admin_permission) {
                    redis_client.set("s." + r.server_id, "sea");
                    cmd_done = true;
                    reply = sprintf(default_response_template.CMD_SETTING_SERVER_SEA);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                }
                break;
            case "help":
                cmd_done = true;
                if (r.is_direct) {
                    reply = sprintf(default_response_template.CMD_HELP_USER_DM);
                    if (request.replyText) await request.replyText.call(request, reply, request);
                } else {
                    if (!admin_permission) {
                        reply = sprintf(default_response_template.CMD_HELP_USER_CHANNEL);
                        if (request.replyText) await request.replyText.call(request, reply, request);
                    } else {
                        if (r.server_id) {
                            reply = sprintf(default_response_template.CMD_HELP_ADMIN_SERVER);
                            if (request.replyText) await request.replyText.call(request, reply, request);
                        } else {
                            reply = sprintf(default_response_template.CMD_HELP_ADMIN_CHANNEL);
                            if (request.replyText) await request.replyText.call(request, reply, request);
                        }
                    }
                }
                break;
        }
        logger.log('info', {
            type: "DISCORD_BOT_CMD",
            cmd: query.toLowerCase(),
            cmd_done: cmd_done,
            query,
            server,
            request: r,
        });
        return cmd_done;
    } else {
        logger.log('info', {
            type: "DISCORD_BOT_QUERY_FAIL",
            error: "INVALID_SERVER",
            query,
            server,
            request: r,
        });
    }

};

module.exports = {
    default_response_template,
    sample_request,
    fromTimestamp,
    getCurrentTimestamp,
    setup,
    resolve,
};