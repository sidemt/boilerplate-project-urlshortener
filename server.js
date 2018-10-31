'use strict';

var express = require('express');
var mongo = require('mongodb');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var dns = require('dns');
var urlRegex = require('url-regex');

var cors = require('cors');

var app = express();

// Basic Configuration 
var port = process.env.PORT || 3000;

/** this project needs a db !! **/ 
mongoose.connect(process.env.MONGOLAB_URI);
var Schema = mongoose.Schema;

// Counter to create short url
var CounterSchema = new Schema({
  _id: String,
  seq: Number
});

// Counter Model
var Counter = mongoose.model('Counter', CounterSchema);

var getNextSequence = function (name, done) {
  Counter.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { new: true }, function (err, docs){
    if (err) {
      done(err);
    } else {
      done(null, docs.seq); // Return the new seq number
    }
  });
};

// A Model to store URL data
var UrlSchema = new Schema({
  original: String,
  short: { type: String, unique: true }
});

var UrlModel = mongoose.model('UrlModel', UrlSchema);

var createAndSaveUrl = function(originalUrl, seq, done) {
  var urlObj = new UrlModel({
    original: originalUrl,
    short: seq
  });
  urlObj.save(function(err, data){
    if(err) return done(err);
    done(null, data.short); // Return the new short URL (= seq number)
  });
};

var findOriginalUrl = function(shortUrlId, done) {
  UrlModel.find({ short: shortUrlId }, function(err, docs){
    if (err) {
      console.error("An error has occurred: " + err);
      done(err);
    }
    done(null, docs);
  });
};

app.use(cors());

/** this project needs to parse POST bodies **/
// you should mount the body-parser here
app.use(bodyParser.urlencoded({extended: false}));

app.use('/public', express.static(process.cwd() + '/public'));

app.get('/', function(req, res){
  res.sendFile(process.cwd() + '/views/index.html');
});

  
// your first API endpoint... 
app.get("/api/hello", function (req, res) {
  res.json({greeting: 'hello API'});
});

function isValidFormat(url) {
  // 'url-regex' cannot check if the URL begins with 'http(s)://'
  const httpRegex = /^https?\:\/\//i;
  // Check if the URL begins with 'http(s)://' AND is in a valid URL format checked with 'url-regex'
  return httpRegex.test(url) && urlRegex({exact: true, strict: true}).test(url);
};

function isValidSite(host, done) {
  dns.lookup(host, (err, address, family) => {
    if (err) {
      done(err);
    } else {
      done(null, address, family);
    }
  });
};

// Create a short URL from the posted URL
app.post('/api/shorturl/new', function(req, res) {
  var postedUrl = req.body.url;
  console.log("Posted URL: " + postedUrl);
  
  if (!isValidFormat(postedUrl)) {
    res.json({"error":"invalid URL"});
  } else {
    console.log("Valid URL format");
    var arr = postedUrl.split("/");
    var host = arr[2];
    console.log("host= " + host);
    
    isValidSite(host, function(err, address, family) {
      if (err) {
        // DNS lookup failed
        res.json({"error":"invalid URL"});
      } else {
         // DNS lookup succeeded
        console.log("Posted URL is valid");

        getNextSequence("shortUrlId", function(err, newSeq){
          if(err) {
            console.error(err);
          } else {
            // create and save
            createAndSaveUrl(postedUrl, newSeq, function(err, result){
              if(err) {
                console.error(err);
              } else {
                console.log("new short URL is: " + result);
                // Return the shortened URL in the JSON
                res.json({"original_url": postedUrl,"short_url": result});
              }
            })
          }
        });
      }
    });
  }
});

// Redirect the user to the original URL
app.get("/api/shorturl/:shortUrlId", function (req, res) {
  var reqId = req.params.shortUrlId;
  console.log("requested short URL ID: " + reqId);
  findOriginalUrl(reqId, function(err, result) {
    if(err){
      console.error(err);
      res.json({"error": "No short URL found for given input"});
    } else {
      if (result.length > 0) {
        console.log(result);
        // The returned result is an array of 1 object
        res.redirect(302, result[0]['original']);
      } else {
        console.log(result);
        res.json({"error": "No short URL found for given input"});
      }
    }
  });
});

app.listen(port, function () {
  console.log('Node.js listening ...');
});