const express = require('express');
const line = require('@line/bot-sdk');
const poporing = require('./poporing');
const bodyParser = require('body-parser');
const TelegramBotClient = require('telegram-bot-client');

const port = process.env.PORT || 3000;

const app = express();

const line_config = {
    "channelAccessToken": process.env.LINE_CHANNEL_ACCESS_TOKEN,
    "channelSecret": process.env.LINE_CHANNEL_SECRET,
};
const line_client = new line.Client(line_config);

const telegram_config = {
    "apiToken": process.env.TELEGRAM_API_TOKEN,
};
const telegram_client = new TelegramBotClient(telegram_config.apiToken);

const replyText = (token, texts) => {
    texts = Array.isArray(texts) ? texts : [texts];
    return line_client.replyMessage(
        token,
        texts.map((text) => typeof text !== "object" ? ({type: 'text', text: "" + text}) : text)
    );
};

const url_check_string_sea = "https://poporing.life/?search=";
const url_check_string_glboal = "https://global.poporing.life/?search=";

async function handleText(event) {
    const message = event.message;
    const replyToken = event.replyToken;
    let data = null;
    let query = message.text;
    let triggered = false;
    let server = null;
    let activation = "_direct";

    const check_string = "/ppr ";

    query = query.trim();
    if (query.startsWith(check_string)) {
        query = query.substr(check_string.length).trim();
        activation = "_mention";
        triggered = true;
    } else if (query.startsWith(url_check_string_sea)) {
        query = query.substr(url_check_string_sea.length);
        if (!query.startsWith(":")) query = query.replace(/_/g, " ");
        query = query.trim();
        server = "sea";
        activation = "_url_sea";
        triggered = true;
    } else if (query.startsWith(url_check_string_glboal)) {
        query = query.substr(url_check_string_glboal.length);
        if (!query.startsWith(":")) query = query.replace(/_/g, " ");
        query = query.trim();
        server = "global";
        activation = "_url_global";
        triggered = true;
    }

    if (event.source.type === "user") {
        // activate on everything
        data = {
            user_id: "line-" + event.source.userId,
            channel_id: "line-dm-" + event.source.userId,
            server_id: null,

            user_display_name: "",

            activation: "line_dm" + activation,
            query,

            is_direct: true,
            is_admin: true,

            default_server: server,
            raw: event,
        };
        triggered = true;
    } else {
        // activate only on "/ppr xxx" or full url "https://poporing.life/?search=:dasdas"
        const channel_id = event.source.groupId ? "line-g-" + event.source.groupId : "line-r-" + event.source.groupId;
        const user_id = event.source.userId || "line-anonymous-" + channel_id;
        data = {
            user_id,
            channel_id,
            server_id: null,

            user_display_name: event.source.userId ? "you" : "Anonymous",

            activation: "line_" + event.source.type + activation,
            query,

            is_direct: true,
            is_admin: true,

            default_server: server,
            raw: event,
        }
    }

    if (!triggered) return;

    poporing.resolve({
        data,
        response_template: poporing.default_response_template,
        replyText: (text, request) => {
            replyText(replyToken, text)
        },
        replyPriceData: (data, request) => {
            // replyText(replyToken, JSON.stringify(data))
            replyText(replyToken, {
                "type": "flex",
                "altText": data.server_icon + " " + data.display_name + "\nPrice: **" + data.price + "** z\nVolume: **" + data.volume + "** ea\n\nLast Update: " + data.timestamp + (data.footnote ? "\n" + data.footnote : ""),
                "contents": {
                    "type": "bubble",
                    "body": {
                        "type": "box",
                        "layout": "vertical",
                        "spacing": "md",
                        "margin": "none",
                        "contents": [
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "margin": "none",
                                "contents": [
                                    {
                                        "type": "image",
                                        "url": data.image_url,
                                        "flex": 1,
                                        "align": "start",
                                        "size": "xs",
                                        "aspectRatio": "1:1"
                                    },
                                    {
                                        "type": "text",
                                        "text": data.display_name,
                                        "flex": 5,
                                        "margin": "md",
                                        "size": "lg",
                                        "gravity": "center",
                                        "weight": "bold",
                                        "wrap": true,
                                        "action": {
                                            "type": "uri",
                                            "label": "Open Website",
                                            "uri": data.url
                                        }
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "Price: ",
                                        "flex": 0,
                                        "align": "start"
                                    },
                                    {
                                        "type": "text",
                                        "text": data.price,
                                        "flex": 0,
                                        "margin": "sm",
                                        "align": "start",
                                        "weight": "bold"
                                    },
                                    {
                                        "type": "text",
                                        "text": "z",
                                        "flex": 0,
                                        "margin": "sm"
                                    }
                                ]
                            },
                            {
                                "type": "box",
                                "layout": "horizontal",
                                "margin": "none",
                                "contents": [
                                    {
                                        "type": "text",
                                        "text": "Volume: ",
                                        "flex": 0
                                    },
                                    {
                                        "type": "text",
                                        "text": data.volume,
                                        "flex": 0,
                                        "margin": "sm",
                                        "weight": "bold"
                                    },
                                    {
                                        "type": "text",
                                        "text": "ea",
                                        "flex": 0,
                                        "margin": "sm"
                                    }
                                ]
                            },
                            {
                                "type": "text",
                                "text": ("Last Update: " + data.timestamp) + (data.footnote ? "\n" + data.footnote : "")
                            },
                            {
                                "type": "text",
                                "text": data.server_icon,
                                "size": "xxs",
                                "align": "end",
                                "color": data.server_color_hex,
                            }
                        ]
                    }
                }
            })
        },
    }).then(() => {
        // do not wait
    });
    return true;
}

// callback function to handle a single event
function lineHandleEvent(event) {
    switch (event.type) {
        case 'message':
            const message = event.message;
            switch (message.type) {
                case 'text':
                    return handleText(event);
                default:
                    throw new Error(`Unknown message: ${JSON.stringify(message)}`);
            }

        case 'follow':
            return replyText(event.replyToken, 'Hey! Thanks for using PoporingBot. Type in any item name and I will tell you its current price!');

        case 'unfollow':
            return console.log(`Unfollowed this bot: ${JSON.stringify(event)}`);

        case 'join':
            return replyText(event.replyToken, `Joined ${event.source.type}`);

        case 'leave':
            return console.log(`Left: ${JSON.stringify(event)}`);

        default:
            throw new Error(`Unknown event: ${JSON.stringify(event)}`);
    }
}

app.post('/line_webhook', line.middleware(line_config), (req, res) => {
    if (!Array.isArray(req.body.events)) {
        return res.status(500).end();
    }
    Promise.all(req.body.events.map(event => {
        if (
            event.replyToken === '00000000000000000000000000000000' ||
            event.replyToken === 'ffffffffffffffffffffffffffffffff'
        ) {
            // webhook checker
            return;
        }
        return lineHandleEvent(event);
    }))
        .then(() => res.end())
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

app.post('/telegram_webhook', bodyParser.json(), (req, res, next) => {
    console.log(req.body.message);
    if (req.body.message.from.is_bot) {
        res.json({ok: true});
        return;
    }
    let query = req.body.message.text || "";
    let server = null;
    let activation = "_direct";

    const check_string = "/ppr ";

    query = query.trim();
    if (query.startsWith(check_string)) {
        query = query.substr(check_string.length).trim();
        activation = "_mention";
    } else if (query.startsWith(url_check_string_sea)) {
        query = query.substr(url_check_string_sea.length);
        if (!query.startsWith(":")) query = query.replace(/_/g, " ");
        query = query.trim();
        server = "sea";
        activation = "_url_sea";
    } else if (query.startsWith(url_check_string_glboal)) {
        query = query.substr(url_check_string_glboal.length);
        if (!query.startsWith(":")) query = query.replace(/_/g, " ");
        query = query.trim();
        server = "global";
        activation = "_url_global";
    }

    let data = null;
    if (req.body.message.chat.type === "private") {
        data = {
            user_id: "telegram-" + req.body.message.from.id,
            channel_id: "telegram-dm-" + req.body.message.from.id,
            server_id: null,

            user_display_name: req.body.message.from.username,

            activation: "telegram_dm" + activation,
            query: query,

            is_direct: true,
            is_admin: true,

            default_server: server,
            raw: req.body.message,
        };
    } else {
        data = {
            user_id: "telegram-" + req.body.message.from.id,
            channel_id: "telegram-group-" + req.body.message.chat.id,
            server_id: null,

            user_display_name: req.body.message.from.username,

            activation: "telegram_group" + activation,
            query: query,

            is_direct: false,
            is_admin: true,

            default_server: server,
            raw: req.body.message,
        };
    }
    poporing.resolve({
        data,
        response_template: poporing.default_response_template,
        replyText: (text, request) => {
            telegram_client.sendMessage(req.body.message.chat.id, text).catch(e => console.log(e));
        },
        replyPriceData: (data, request) => {
            const text = "<b>" + data.server_icon + " " + data.display_name + "</b>\nPrice: <b>" + data.price + "</b> z\nVolume: <b>" + data.volume + "</b> ea\n\nLast Update: " + data.timestamp + (data.footnote ? "\n" + data.footnote : "") + "\n\n<a href=\"" + data.url + "\">" + data.url + "</a>";
            telegram_client.sendMessage(req.body.message.chat.id, text, {parse_mode: "HTML"}).catch(e => console.log(e));
        },
    });
    res.json({ok: true});
});

poporing.setup().then((s) => {
    if (!s) {
        console.log("Poporing JS setup failed");
        process.exit(1);
    }
    app.listen(port, () => console.log(`Poporing Bot Webhook listening on port ${port}!`));
});