import express from 'express'
import bodyParser from 'body-parser'
import cors from 'cors'
import 'crypto'
import {got} from 'got'
import OAuth  from 'oauth-1.0a'
import twitter from 'twitter-api-v2'
import crypto from 'crypto'
import { MongoClient } from "mongodb";

const app = express();
const port = 3000;
const consumerKey = process.env.consumerKey
const consumerSecret = process.env.consumerSecret
const userId = process.env.userId
const oauthKey = process.env.oauthKey
const oauthSecret = process.env.oauthSecret
const endpointURL = `https://api.twitter.com/2/users/${userId}/timelines/reverse_chronological`
const mongoPath = "mongodb+srv://admin:admin@mentalhealthco.yb78b.mongodb.net/?retryWrites=true&w=majority"
const bearerToken = process.env.bearerToken

// Configuring body parser middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(cors());

const oauth = OAuth({
    consumer: {
      key: consumerKey,
      secret: consumerSecret,
    },
    signature_method: "HMAC-SHA1",
    hash_function: (baseString, key) =>
      crypto.createHmac("sha1", key).update(baseString).digest("base64"),
});

const token = {
    key: oauthKey,
    secret: oauthSecret,
};

function get_challenge_response(crc_token, consumer_secret) {
    hmac = crypto.createHmac('sha256', consumer_secret).update(crc_token).digest('base64')
    return hmac
}

async function fetchTimeline() {
    var response = {}
    try {
        const authHeader = oauth.toHeader(
            oauth.authorize(
                {
                url: endpointURL,
                method: "GET",
                },
                token
            )
        )
        response = await got.get(endpointURL, {
            responseType: "json",
            headers: {
                Authorization: authHeader["Authorization"],
                "user-agent": "v2ReverseChronHomeTimelinesJS",
            },
        })
    } catch(error) {
        response = {
            "body": {
                "error": error.toString()
            }
        }
    }
    return response.body
}

app.get('/startCapture', async(req, res) => {
    const client = new MongoClient(mongoPath)
    await client.connect()
    const database = client.db("test")
    const accountactivities = database.collection("accountactivities")

    var activity = []
    var timeline = {}

    try {
        var ts = Math.floor(new Date().getTime() / 1000).toString()
        var cursor = accountactivities.find({ "timeStamp": { "$gte": "0", "$lt": ts } })
        var arr = await cursor.toArray()
        for(var i = 0; i < arr.length; i++) {
            activity[i] = arr[i]
        }
        timeline = await fetchTimeline()
    } catch(error) {
        res.send({
            "status" : "400 - Bad Request",
            "error": error.toString(),
            "timeline": timeline,
        })
    } finally {
        await client.close()
    }
    res.send({
        "status": "ok",
        "activity": activity,
        "timeline": timeline,
    })
})

app.get('/oauth2_callback_url', async(req, res) => {
    console.log(req.body)
    res.send({"status": 200})
})

// This endpoint uses V1.1 which does not support start_time, end_time parameters
app.get('/timeline', async (request, res) => {
    const authHeader = oauth.toHeader(
        oauth.authorize(
            {
            url: endpointURL,
            method: "GET",
            },
            token
        )
    );

    const req = await got.get(endpointURL, {
        responseType: "json",
        headers: {
            Authorization: authHeader["Authorization"],
            "user-agent": "v2ReverseChronHomeTimelinesJS",
        },
    });
    
    
    // return req.body;
    res.send({
        "timeline": req.body,
        "status": 200,
    })
    if (req.body) {
        return req.body;
    } else {
        throw new Error("Unsuccessful request");
    }

})

app.get('/userInfo', async (req, res) => {
    const twitterClient = new twitter.TwitterApi(bearerToken);
    const user = await twitterClient.v2.userByUsername('landon_maddy');
    console.log(user)
    res.send({
        "response": user,
        "status": "200"
    })
})
  
app.get('/', (req, res) => {
    var response = get_challenge_response(req.query["crc_token"], consumerSecret)
    res.send({
        "response_token": 'sha256=' + response,
        "status": 200,
    })
})

app.post('/', async (req, res) => {
    var act = JSON.stringify(req.body)
    const client = new MongoClient(mongoPath);
    await client.connect();
    const database = client.db("test");
    const accountactivities = database.collection("accountactivities");

    try {
        var ts = Math.floor(new Date().getTime() / 1000).toString()
        const Activity = {
            timeStamp: ts,
            activity: act,
        }
        await accountactivities.insertOne(Activity);
    } catch(error) {
        res.send({
            "status": "400 - Bad request",
            "error": error.toString()
        })
    } finally {
        await client.close()
    }
    res.send({
        "status": "ok"
    })
});

app.listen(port, () => console.log(`Mental Health Co app listening on port ${port}!`));
