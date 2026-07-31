'use strict';
const fs = require('fs');
const FormData = require('form-data');

const action = async context => {
  const baseUrl = context.config.get('baseUrl').replace(/\/+$/, '');
  const uploadKey = context.config.get('uploadKey');
  const filePath = await context.filePath();

  context.setProgress('Uploading…');

  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  const response = await context.request(`${baseUrl}/api/kap/upload`, {
    method: 'post',
    headers: {
      'X-Kap-Key': uploadKey,
    },
    body: form,
  });

  let body;
  try {
    body = JSON.parse(response.body);
  } catch {
    throw new Error('Upload failed — invalid response from server');
  }

  if (!body.ok || !body.url) {
    throw new Error(body.error || 'Upload failed');
  }

  context.copyToClipboard(body.url);
  context.notify('Recording URL copied to clipboard');
};

const reave = {
  title: 'Share on Reave',
  configDescription:
    'Uploads to your Reave app on Railway. Set KAP_UPLOAD_KEY on the server and paste the same value here.',
  formats: ['gif', 'mp4', 'webm', 'apng'],
  action,
  config: {
    baseUrl: {
      title: 'Base URL',
      type: 'string',
      default: 'https://reave.app',
      required: true,
    },
    uploadKey: {
      title: 'Upload key',
      type: 'string',
      default: '',
      required: true,
    },
  },
};

exports.shareServices = [reave];
