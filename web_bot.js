const express = require('express');
const line = require('@line/bot-sdk');
const poporing = require('./poporing');
const bodyParser = require('body-parser');
const TelegramBotClient = require('telegram-bot-client');
const jwt = require('jsonwebtoken');
const axios = require('axios');

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

const FACEBOOK_ACCESS_TOKEN = process.env.FACEBOOK_ACCESS_TOKEN;

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
                    return replyText(event.replyToken, `Sorry, PoporingBot don't understand ${message.type}`);
                // throw new Error(`Unknown message: ${JSON.stringify(message)}`);
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

app.post('/telegram_push', bodyParser.json(), (req, res, next) => {
    if (!req.body.message.text || !req.body.message.target_id) {
        res.json({ok: false});
        return;
    }
    let msgpm = telegram_client;
    if (req.body.message.image) {
        msgpm = msgpm.sendPhoto(req.body.message.target_id, req.body.message.image, req.body.message.image_options || req.body.message.options || {})
    }
    msgpm = msgpm.sendMessage(req.body.message.target_id, req.body.message.text, req.body.message.options || {});
    msgpm.catch(e => console.log(e));
    res.json({ok: true});
});

app.post('/telegram_webhook', bodyParser.json(), (req, res, next) => {
    // console.log(req);
    console.log(req.body);
    // console.log(req.body.message);
    if (!req.body.message) {
        res.json({ok: true});
        return;
    }
    if (req.body.message.from.is_bot) {
        res.json({ok: true});
        return;
    }
    let query = req.body.message.text || "";
    let server = null;
    let activation = "_direct";

    if (query === "/start" || query === "/ppr") {
        const text = 'Hey! Thanks for using PoporingBot. Type in any item name (or "/ppr item_name" in group) and I will tell you its current price!';
        telegram_client.sendMessage(req.body.message.chat.id, text).catch(e => console.log(e));
        res.json({ok: true});
        return;
    }

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

    if (query === "cmd/notification") {
        const link_code = jwt.sign({id: req.body.message.chat.id, t: "tg"}, process.env.JWT_SECRET, {noTimestamp: true}).replace("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.", "").replace(".", "$");
        telegram_client.sendMessage(req.body.message.chat.id, "Please use the following code on Poporing Life Telegram Notification Link when asked").sendMessage(req.body.message.chat.id, link_code).catch(e => console.log(e));
        res.json({ok: true});
        return;
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

// messaging type is RESPONSE or UPDATE
const sendFacebookTextMessage = (userId, text, raw = false) => {
    return axios.post(`https://graph.facebook.com/v2.6/me/messages?access_token=${FACEBOOK_ACCESS_TOKEN}`,
        raw ? text : {
            messaging_type: "RESPONSE",
            recipient: {
                id: userId,
            },
            message: raw ? text : {
                text,
            },
        }
    ).catch(e => console.log("Facebook send message error", e));
};

app.get('/facebook_webhook', bodyParser.json(), bodyParser.urlencoded({extended: true}), (req, res, next) => {
    let VERIFY_TOKEN = '2zakoypXGPsWuYhT';

    let mode = req.query['hub.mode'];
    let token = req.query['hub.verify_token'];
    let challenge = req.query['hub.challenge'];

    if (mode && token === VERIFY_TOKEN) {
        res.status(200).send(challenge);
    } else {
        res.sendStatus(403);
    }
});

app.post('/facebook_webhook', bodyParser.json(), bodyParser.urlencoded({extended: true}), (req, res, next) => {
    if (req.body.object === 'page') {
        req.body.entry.forEach(entry => {
            entry.messaging.forEach(event => {
                if (event.message && event.message.text) {
                    // Facebook messenger current have only 1-on-1 chat
                    const userId = event.sender.id;
                    const message = event.message.text;

                    let query = message || "";
                    let server = null;
                    let activation = "_direct";

                    if (query === "/start" || query === "/ppr") {
                        const text = 'Hey! Thanks for using PoporingBot. Type in any item name and I will tell you its current price!';
                        sendFacebookTextMessage(userId, text).catch(e => console.log(e));
                        return;
                    }

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

                    if (query === "cmd/notification") {
                        const link_code = jwt.sign({id: userId, t: "fb"}, process.env.JWT_SECRET, {noTimestamp: true}).replace("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.", "").replace(".", "$");
                        sendFacebookTextMessage(userId, "Please use the following code on Poporing Life Facebook Messenger Notification Link when asked")
                            .then(() => sendFacebookTextMessage(userId, link_code));
                        return;
                    }

                    sendFacebookTextMessage(userId, {
                        messaging_type: "RESPONSE",
                        recipient: {
                            id: userId,
                        },
                        sender_action: "typing_on",
                    }, true);

                    let data = {
                        user_id: "facebook-" + userId,
                        channel_id: "facebook-dm-" + userId,
                        server_id: null,

                        user_display_name: "you",

                        activation: "facebook_dm" + activation,
                        query: query,

                        is_direct: true,
                        is_admin: true,

                        default_server: server,
                        raw: event,
                    };
                    poporing.resolve({
                        data,
                        response_template: poporing.default_response_template,
                        replyText: (text, request) => {
                            sendFacebookTextMessage(userId, text);
                        },
                        replyPriceData: (data, request) => {
                            const text = data.server_icon + " " + data.display_name + "\nPrice: " + data.price + " z\nVolume: " + data.volume + " ea\n\nLast Update: " + data.timestamp + (data.footnote ? "\n" + data.footnote : "") + "\n\n" + data.url;
                            sendFacebookTextMessage(userId, text);
                        },
                    });
                }
            });
        });
        res.status(200).end();
    }
});

app.post('/facebook_push', bodyParser.json(), (req, res, next) => {
    if (!req.body.message.text || !req.body.message.target_id) {
        res.json({ok: false});
        return;
    }
    const userId = req.body.message.target_id;
    if (req.body.message.image) {
        sendFacebookTextMessage(userId, {
            messaging_type: "MESSAGE_TAG",
            tag: "GAME_EVENT",
            recipient: {
                id: userId,
            },
            message: {
                attachment: {
                    type: "image",
                    payload: {
                        url: req.body.message.image,
                    }
                },
            }
        }, true);
    }
    sendFacebookTextMessage(userId, {
        messaging_type: "MESSAGE_TAG",
        tag: "GAME_EVENT",
        recipient: {
            id: userId,
        },
        message: {
            text: req.body.message.text,
        }
    }, true);
    res.json({ok: true});
});

poporing.setup().then((s) => {
    if (!s) {
        console.log("Poporing JS setup failed");
        process.exit(1);
    }
    app.listen(port, () => console.log(`Poporing Bot Webhook listening on port ${port}!`));
});