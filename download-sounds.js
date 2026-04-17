const fs = require('fs');
const https = require('https');
const path = require('path');

const soundsDir = path.join(__dirname, 'public', 'sounds');
if (!fs.existsSync(soundsDir)){
    fs.mkdirSync(soundsDir, { recursive: true });
}

const download = (url, dest) => {
  https.get(url, (res) => {
    const file = fs.createWriteStream(dest);
    res.pipe(file);
    file.on('finish', () => {
      file.close();
      console.log('Downloaded', dest);
    });
  });
};

download('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3', path.join(soundsDir, 'bell.mp3'));
download('https://assets.mixkit.co/active_storage/sfx/2870/2870-preview.mp3', path.join(soundsDir, 'chime.mp3'));
download('https://assets.mixkit.co/active_storage/sfx/2003/2003-preview.mp3', path.join(soundsDir, 'register.mp3'));
