// credentials loading
var creds = require("./creds");
var API_KEY = creds.apiKey;
var BASE_URL = "utah-court-calendar-service.herokuapp.com";
var API_VER = "/api/v0/";

// app initialization
var express = require("express");
var app = express();

// dependencies
var twilio = require("twilio");
var http = require('http');
var bodyParser = require('body-parser');
var cookieParser = require("cookie-parser");

app.use(cookieParser());
app.use(bodyParser.urlencoded({extended:true}));
app.use(bodyParser.json());

// functions
function assemble (param, val, cb) {
	var options = {
		host: BASE_URL,
		path: API_VER + "event-search.json?api_key=" + API_KEY + "&" + param + "=" + encodeURI(val),
	};

	http.request(options, function (response) {
		var body = "";
		response.on("data", function(d) {
			body += d;
		});
		response.on("end", function() {
			var parsed = JSON.parse(body),
					r = parsed.results,
					cns = [];

			if (r) {
				r.forEach(function (ea) {
					var cn = ea.case_number;
					if (cns.indexOf(cn) == -1) { cns.push(ea); }
				});
				cb(false, cns);
			} else {
				cb(true, null);
			}
		});
	}).end();
};

// common response types
var res_types = {
	affirmative: ["Y","YE","YS","YA","YES","YEP","YUP","YEA","YEAH"],
	negative: ["N","NO","NE","NA","NOPE","NOOPE","NAH","NAHH","NAY","NOO","NOOO"]
};

app.post("/sms", function (req, res) {
	var twiml = new twilio.TwimlResponse();
	var from = req.body.From.replace(/\D+/g, "");
	var text = req.body.Body.toUpperCase();

	// user is new or has not communicated in 4 hours
	if (!req.session.state || text.replace(new RegExp(" ", "g"), "") == "") {
		twiml.sms("Welcome to CourtSMS. Reply \"NAME\" to search by name or \"CASE\" to search by case number.");
		req.session.state = "method_indication";
		res.send(twiml.toString());

	// user is engaged in a discussion with logic tree
	} else {

		// selecting how to query
		if (req.session.state == "method_indication" || text == "NAME") {
			if (text == "NAME") {
				twiml.sms("To search by name, send me your name in the following format: FIRST MIDDLE LAST.");
				req.session.state = "method_name";
				res.send(twiml.toString());
			} else if (text == "CASE") {
				twiml.sms("To search by case, send me your case number. For example: WVC 123456789.");
				req.session.state = "method_case";
				res.send(twiml.toString());
			} else {
				twiml.sms("Sorry I don't understand. Reply \"NAME\" to search by name or \"CASE\" to search by case number.");
				req.session.state = "method_indication";
				res.send(twiml.toString());
			}

		// name query
		} else if (req.session.state == "method_name") {

			// clean up name
			var name = text.split(" ");
			var last = text[text.length - 1];
			var first = text[0];
			var query_name = last + ", " + first;

			assemble("defendant_name", query_name, function (err, dates) {
				if (err) {
					twiml.sms("Sorry, I made an error. Please try again.");
					req.session.state = "method_name";
					res.send(twiml.toString());

				} else {
					if (dates.length == 0) {
						twiml.sms("I could not find any dates for that name. Reply \"NAME\" to search by name or \"CASE\" to search by case number.");
						req.session.state = "method_indication";
						res.send(twiml.toString());

					} if (dates.length > 0) {
						var ds = [];
						for (var i = 0; i < 5; i++) {
							if (i < dates.length - 1) {
								var d = dates[i];
								var str = d.defendant + " (" + case_number + ")";
								ds.push(str);
								// var str = "Case # " + d.case_number + " (" + d.court_date + " @" + d.court_time + " in room " + d.court_room
							}
						}
						if (dates.length > 5) {
							ds.push(" and " + Number(dates.length - 5) + " others (for full list call CJS at (385) 468-3500)." )
						}
						twiml.sms("The following cases were found: " + ds.join(", ") + ". Reply with the case number you want details on or \"NAME\" to try a new name.");
						req.session.state = "method_case";
						res.send(twiml.toString());
					}
				}
			});

		// case query
		} else if (req.session.state == "method_case") {

			assemble("case_number", text, function (err, dates) {
				if (err) {
					twiml.sms("Sorry, I made an error. Please try again.");
					req.session.state = "method_case";
					res.send(twiml.toString());

				} else {
					if (dates.length == 0) {
						twiml.sms("I could not find any dates for that name. Reply \"NAME\" to search by name or \"CASE\" to search by case number.");
						req.session.state = "method_indication";
						res.send(twiml.toString());

					} if (dates.length > 0) {
						var ds = [];
						for (var i = 0; i < 5; i++) {
							if (i < dates.length - 1) {
								var d = dates[i];
								var str = d.hearing_type + " on " + d.court_date + " at " + d.court_time + " in room " + d.court_room + " at " + court_title;
								ds.push(str);
							}
						}
						if (dates.length > 5) {
							ds.push(" and " + Number(dates.length - 5) + " others (for full list call CJS at (385) 468-3500)." )
						}
						twiml.sms("The following court dates for that case number were found: " + ds.join(", ") + ".");
						req.session.state = undefined;
						res.send(twiml.toString());
					}
				}
			});
			
		// catch all
		} else {
			twiml.sms("Sorry I don't understand. Reply \"NAME\" to search by name or \"CASE\" to search by case number.");
			req.session.state = "method_indication";
			res.send(twiml.toString());
		}
	}
});

app.get("*", function (req, res) {
	res.send("Service is only for Twilio twiML responses. Nothing else supported.");
});

var port = 8080;
app.listen(port, function () { console.log("Listening on port", port); });