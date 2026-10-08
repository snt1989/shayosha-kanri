// Webアプリと共有している ../lib（型・燃費計算・社員番号など）を、モバイルからも読めるようにする。
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
config.watchFolders = [...(config.watchFolders || []), path.resolve(__dirname, '..', 'lib')];

module.exports = config;
