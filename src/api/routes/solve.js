// Copyright(C) 2022 Marcus Huber (xenorio) 
// <dev@xenorio.xyz>

// This program is free software: you can redistribute it and / or modify
// it under the terms of the GNU Affero General Public License as published
// by the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.

// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
// See the GNU Affero General Public License for more details.

// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
// ######################################################################### //

const fetch = require('cross-fetch')
const config = require('../../../config')
const welcomemsg = require('../../welcome-messages')

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
                .catch(() => {}) // Any errors here will be catched by member being undefined

            if (!member) return res.json({
                success: false,
                error: 'Invalid Member'
            })

            if (member.roles.cache.has(config.onboarding.verifiedRole)) return res.json({
                success: true // Don't need to show an error message here
            })

            member.roles.add(config.onboarding.verifiedRole)
                .then(() => {

                    res.json({
                        success: true
                    })

                    try {
                        guild.channels.resolve(config.onboarding.welcomeChannel).send(welcomemsg.get().replaceAll('%user%', `<@${member.id}>`))
                    } catch (error) {
                        console.error(error)
                    }

                })
                .catch(err => {
                    console.error(err)
                    res.json({
                        success: false,
                        error: 'Unable to add role'
                    })
                })
            
        } else {
            res.json({
                success: false,
                error: 'Invalid Captcha'
            })
        }
    })
}