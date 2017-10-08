// Imports the Google Cloud client library
const Speech = require('@google-cloud/speech');
const fs = require('fs');

// Your Google Cloud Platform project ID
const projectId = 'hackinout';

// Instantiates a client
const speechClient = Speech({
  projectId: projectId,
  keyFilename: './hackinout-f3205d9e75fc.json'
});

// The name of the audio file to transcribe
const fileName = './test1.wav';

// Reads a local audio file and converts it to base64
const file = fs.readFileSync(fileName);
const audioBytes = file.toString('base64');

// The audio file's encoding, sample rate in hertz, and BCP-47 language code
const audio = {
  content: audioBytes
};
const config = {
  encoding: 'LINEAR16',
  sampleRateHertz: 44100,
  languageCode: 'bn-IN'
};
const request = {
  audio: audio,
  config: config
};

// Detects speech in the audio file
speechClient.recognize(request)
  .then((results) => {
    console.log(results);
    const transcription = results[0].results[0].alternatives[0].transcript;
    console.log(`Transcription: ${transcription}`);
  })
  .catch((err) => {
    console.error('ERROR:', err);
  });