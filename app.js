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
    const localFilename = `./converted_file${Date.now()}.wav`;

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
                            res.pipe(fs.createWriteStream(localFilename));
                        });
                        fileRequest.on('end', function () {
                            console.log('File download complete');
                            waterfallCallback();
                        });
                    }
                }
            }).auth(apiKey, '', true).pipe(fs.createWriteStream(localFilename));
        },

        function () {
            console.log('Streaming of file has been done');

            const file = fs.readFileSync(localFilename);
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
                    if (!results || results.length === 0 || !results[0].results || results[0].results.length === 0 ) {
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
								targetData: translation
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


app.listen(3000, () => {
    console.log('Server is listening');
});