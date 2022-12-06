// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const fetch = require('cross-fetch')
const config = require('../../../config')

module.exports.path = '/captcha/solve'

module.exports.POST = async(client, req, res, next) => {
    if (!req.body.user) return res.json({ success: false })
    fetch(`https://hcaptcha.com/siteverify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: `response=${req.body.key}&secret=${config.keys.hcaptcha}&sitekey=046fea03-aad9-4e07-8d2c-41a1ddfff729`
    }).then(async response => {
        let data = await response.json()
        if (data.success) {
            let guild = client.guilds.resolve(config.guild)
            let member = await guild.members.fetch(req.body.user)
            console.log(member)
            if (!member) return res.json({
                success: false
            })
            member.roles.add(config.onboarding.verifiedRole)
                .then(() => {
                    res.json({
                        success: true
                    })
                })
                .catch(err => {
                    console.error(err)
                    res.json({
                        success: false
                    })
                })
        } else {
            res.json({
                success: false
            })
        }
    })
}