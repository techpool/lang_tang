const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const request = require('request');
const async = require('async');

const app = express();

// Imports the Google Cloud client library
const Speech = require('@google-cloud/speech');
const Translate = require('@google-cloud/translate');
const fs = require('fs');

// Your Google Cloud Platform project ID
const projectId = 'hackinout';

// Instantiates a client
const speechClient = Speech({
    projectId: projectId,
    keyFilename: './hackinout-f3205d9e75fc.json'
});

const translateClient = Translate({
    projectId: projectId,
    keyFilename: './hackinout-f3205d9e75fc.json'
});

app.post('/audio', upload.any(), function (req, res, next) {
    console.log(req.body);
    console.log(req.files);
    const targetLanguage = req.body.targetLanguage;
    const originLanguage = req.body.language;

    // The name of the audio file to transcribe
    const fileName = req.files[0].path;
    const apiKey = '218fdc6042f51ea477d8b61426f3207dba050481';
    const localFileName = `./converted_file${Date.now()}.wav`;

    async.waterfall([
        function (waterfallCallback) {
            var formData = {
                target_format: 'wav',
                source_format: 'aac',
                source_file: fs.createReadStream(fileName),
            };

            request.post({ url: 'https://sandbox.zamzar.com/v1/jobs/', formData: formData }, function (err, response, body) {
                if (err) {
                    console.error('Unable to start conversion job', err);
                } else {
                    console.log('SUCCESS! Conversion job started:', body);
                }
                waterfallCallback(err, body);
            }).auth(apiKey, '', true);
        },

        function (body, waterfallCallback) {
            const jobID = JSON.parse(body).id;

            async.forever(function (foreverCallback) {
                request.get('https://sandbox.zamzar.com/v1/jobs/' + jobID, function (err, response, body) {
                    if (err) {
                        console.error('Unable to get job', err);
                    } else {
                        console.log('SUCCESS! Got job:', JSON.parse(body));

                        if (JSON.parse(body).target_files && JSON.parse(body).target_files.length > 0) {
                            waterfallCallback(null, body);
                        } else {
                            foreverCallback();
                        }
                    }
                }).auth(apiKey, '', true);
            });
        },

        function (body, waterfallCallback) {
            console.log(body);

            const fileID = JSON.parse(body).target_files[0].id;

            var streamFile = request.get({ url: 'https://sandbox.zamzar.com/v1/files/' + fileID + '/content', followRedirect: false }, function (err, response, body) {
                if (err) {
                    console.error('Unable to download file:', err);
                } else {
                    // We are being redirected
                    if (response.headers.location) {
                        // Issue a second request to download the file
                        var fileRequest = request(response.headers.location);
                        fileRequest.on('response', function (res) {
                            res.pipe(fs.createWriteStream(localFileName));
                        });
                        fileRequest.on('end', function () {
                            console.log('File download complete');
                            waterfallCallback();
                        });
                    }
                }
            }).auth(apiKey, '', true).pipe(fs.createWriteStream(localFileName));
        },

        function () {
            console.log('Streaming of file has been done');

            const file = fs.readFileSync(localFileName);
            const audioBytes = file.toString('base64');

            // The audio file's encoding, sample rate in hertz, and BCP-47 language code
            const audio = {
                content: audioBytes
            };
            const config = {
                encoding: 'LINEAR16',
                languageCode: originLanguage
            };
            const requestData = {
                audio: audio,
                config: config
            };

            // Detects speech in the audio file
            speechClient.recognize(requestData)
                .then((results) => {
                    console.log(results);

                    let transcription = ''
                    if (!results || results.length === 0 || !results[0].results || results[0].results.length === 0) {
                        transcription = 'Could not understand what you just said!';
                    } else {
                        transcription = results[0].results[0].alternatives[0].transcript;
                    }
                    console.log(`Transcription: ${transcription}`);

                    translateClient.translate(transcription, targetLanguage.split('-')[0])
                        .then((results) => {
                            const translation = results[0];

                            console.log(`Text: ${transcription}`);
                            console.log(`Translation: ${translation}`);


                            res.status(200).json({
                                targetLanguage: targetLanguage,
                                targetData: translation,
                                originalData: transcription
                            });
                        })
                        .catch((err) => {
                            console.error('ERROR:', err);
                        });
                })
                .catch((err) => {
                    console.error('ERROR:', err);
                    res.status(400).json({
                        'info': err
                    });
                });
        }
    ]);
});



const TelegramBot = require('node-telegram-bot-api');
var redis = require("redis"),
    client = redis.createClient({
        url: 'redis://techpool:30861d780282920aeebae06ed3ad2f26@50.30.35.9:3656/'
    });

// if you'd like to select database 3, instead of 0 (default), call
// client.select(3, function() { /* ... */ });

client.on("error", function (err) {
    console.log("Error " + err);
});

// replace the value below with the Telegram token you receive from @BotFather
const token = '462993638:AAHa1JnUop0yl7Duq1cxtnktp4MWZ54Gaj4';

// Create a bot that uses 'polling' to fetch new updates
const bot = new TelegramBot(token, { polling: true });


const languages = require('./languages.json');

const currentQueue = [];

// Matches "/echo [whatever]"
bot.onText(/\/echo (.+)/, (msg, match) => {
    // 'msg' is the received Message from Telegram
    // 'match' is the result of executing the regexp above on the text content
    // of the message

    const chatId = msg.chat.id;
    const resp = match[1]; // the captured "whatever"

    // send back the matched "whatever" to the chat
    bot.sendMessage(chatId, resp);
});

// Listen for any kind of message. There are different kinds of
// messages.
bot.on('message', (msg) => {
    const chatId = msg.chat.id;
    const senderId = msg.from.id;

    if (msg.voice && msg.voice.file_id) {
        const file_id = msg.voice.file_id;
        for (var i = currentQueue.length - 1; i >= 0; i--) {
            if (currentQueue[i].senderId === senderId) {
                currentQueue[i] = {
                	senderId: senderId,
                	file_id: file_id
                };
                sendMessageWithKeyboardButtonsToUser(chatId, null, msg.message_id);
                return
            }
        }
        currentQueue.push({
    		senderId: senderId,
    		file_id: file_id
    	});
        sendMessageWithKeyboardButtonsToUser(chatId, null, msg.message_id);
        return;
    }


    
    for (var i = languages.length - 1; i >= 0; i--) {
        if (languages[i].Language == msg.text) {
    		console.log(msg.text);
    		console.log('I have been matched');
    		console.log(currentQueue);
            for (var i = currentQueue.length - 1; i >= 0; i--) {
                if (currentQueue[i].senderId === senderId) {
                    // check if he has a origin language
                    if (!currentQueue[i].originLanguage) {
                        currentQueue[i].originLanguage = languages[i].languageCode;
                        sendMessageWithKeyboardButtonsToUser(chatId, null, msg.message_id);
                        return;
                    } else {
                        // this is the final target language, we should process and send the translated audio
                        processImageAndGiveParsedMessage(currentQueue[i].file_id, currentQueue[i].originLanguage, languages[i].languageCode, chatId);
                        return;
                    }
                }
            }
        }
    }
    // send a message to the chat acknowledging receipt of their message
    bot.sendMessage(chatId, 'I don\'t understand you' );
});

var download = require('download-file')
 
function processImageAndGiveParsedMessage(fileId, originLanguage, targetLanguage, chatId) {
	// bot.sendMessage(chatId, 'File is to be processed here');
	const localFileName = Date.now();
	const convertedFile = Date.now() + Date.now();
	const apiKey = '218fdc6042f51ea477d8b61426f3207dba050481';

	async.waterfall([
		function(waterfallCallback) {
			request({
				url: 'https://api.telegram.org/bot462993638:AAHa1JnUop0yl7Duq1cxtnktp4MWZ54Gaj4/getFile?file_id=' + fileId,
				method: 'GET',
				json: true
			}, function(error, response, body) {
				waterfallCallback(error, body);
			});
		},

		function(body, waterfallCallback) {
			var url = 'https://api.telegram.org/file/bot462993638:AAHa1JnUop0yl7Duq1cxtnktp4MWZ54Gaj4/' + body.result.file_path;
			var options = {
			    directory: "./uploads",
			    filename: localFileName
			}
			 
			download(url, options, function(err){
			    if (err) throw err
			    waterfallCallback()
			});
		},

		function (waterfallCallback) {

			console.log('hello')
            var formData = {
                target_format: 'wav',
                source_format: 'ogg',
                source_file: fs.createReadStream('uploads/' + localFileName),
            };

            console.log(formData);

            request.post({ url: 'https://sandbox.zamzar.com/v1/jobs/', formData: formData }, function (err, response, body) {
                if (err) {
                    console.error('Unable to start conversion job', err);
                } else {
                    console.log('SUCCESS! Conversion job started:', body);
                }
                waterfallCallback(err, body);
            }).auth(apiKey, '', true);
        },

        function (body, waterfallCallback) {

        	console.log(body);
            const jobID = JSON.parse(body).id;

            async.forever(function (foreverCallback) {
                request.get('https://sandbox.zamzar.com/v1/jobs/' + jobID, function (err, response, body) {
                    if (err) {
                        console.error('Unable to get job', err);
                    } else {
                        console.log('SUCCESS! Got job:', JSON.parse(body));

                        if (JSON.parse(body).target_files && JSON.parse(body).target_files.length > 0) {
                            waterfallCallback(null, body);
                        } else {
                            foreverCallback();
                        }
                    }
                }).auth(apiKey, '', true);
            });
        },

        function (body, waterfallCallback) {
            console.log(body);

            const fileID = JSON.parse(body).target_files[0].id;

            var streamFile = request.get({ url: 'https://sandbox.zamzar.com/v1/files/' + fileID + '/content', followRedirect: false }, function (err, response, body) {
                if (err) {
                    console.error('Unable to download file:', err);
                } else {
                    // We are being redirected
                    if (response.headers.location) {
                        // Issue a second request to download the file
                        var fileRequest = request(response.headers.location);
                        fileRequest.on('response', function (res) {
                            res.pipe(fs.createWriteStream(convertedFile));
                        });
                        fileRequest.on('end', function () {
                            console.log('File download complete');
                            waterfallCallback();
                        });
                    }
                }
            }).auth(apiKey, '', true).pipe(fs.createWriteStream(convertedFile));
        },

        function () {
            console.log('Streaming of file has been done');

            const file = fs.readFileSync(convertedFile);
            const audioBytes = file.toString('base64');

            // The audio file's encoding, sample rate in hertz, and BCP-47 language code
            const audio = {
                content: audioBytes
            };
            const config = {
                encoding: 'LINEAR16',
                languageCode: originLanguage
            };
            const requestData = {
                audio: audio,
                config: config
            };

            // Detects speech in the audio file
            speechClient.recognize(requestData)
                .then((results) => {
                    console.log(results);

                    let transcription = ''
                    if (!results || results.length === 0 || !results[0].results || results[0].results.length === 0) {
                        transcription = 'Could not understand what you just said!';
                    } else {
                        transcription = results[0].results[0].alternatives[0].transcript;
                    }
                    console.log(`Transcription: ${transcription}`);

                    translateClient.translate(transcription, targetLanguage.split('-')[0])
                        .then((results) => {
                            const translation = results[0];

                            console.log(`Text: ${transcription}`);
                            console.log(`Translation: ${translation}`);

                            bot.sendMessage(chatId, translation );
                        })
                        .catch((err) => {
                            bot.sendMessage(chatId, 'I don\'t understand you' );
                        });
                })
                .catch((err) => {
                    console.error('ERROR:', err);
                    bot.sendMessage(chatId, 'I don\'t understand you' );
                });
        }
	])
}

function sendMessageWithKeyboardButtonsToUser(chatId, replyMarkUp, replyToMessageId) {

    const keyboardObject = [];

    for (let i = 0; i < languages.length; i += 3) {

        if (languages[i + 2]) {
            keyboardObject.push([
                { text: languages[i].Language },
                { text: languages[i + 1].Language },
                { text: languages[i + 2].Language },
            ]);
        } else if (languages[i + 1]) {
            keyboardObject.push([
                { text: languages[i].Language },
                { text: languages[i + 1].Language },
            ]);
        } else {
            keyboardObject.push([
                { text: languages[i].Language }
            ]);
        }
    }

    request({
        url: 'https://api.telegram.org/bot462993638:AAHa1JnUop0yl7Duq1cxtnktp4MWZ54Gaj4/sendMessage',
        method: 'POST',
        form: {
            chat_id: chatId,
            text: 'Please select a message',
            reply_to_message_id: replyToMessageId,
            reply_markup: JSON.stringify({
                keyboard: keyboardObject,
                resize_keyboard: true,
                one_time_keyboard: true
            })
        }
    }, function (error, response, body) {
        console.log(body);
    });
}

app.listen(3000, () => {
    console.log('Server is listening');
});