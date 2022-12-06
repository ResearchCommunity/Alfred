// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const path = require('path')

module.exports.path = '/captcha'

module.exports.GET = async(client, req, res, next) => {
    res.sendFile(path.resolve('src/api/captcha.html'))
}