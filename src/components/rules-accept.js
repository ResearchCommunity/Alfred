// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { ComponentType, ButtonStyle } = require('discord.js');
const config = require('../../config');

module.exports.execute = async(client, interaction) => {

    let url = config.onboarding.captcha.baseURL + `?user=${interaction.member.id}`

    interaction.member.fetch(true)
        .then(member => {
            if (member.roles.cache.has(config.onboarding.verifiedRole)) return interaction.reply({
                ephemeral: true,
                content: 'You have already accepted the rules!'
            })

            interaction.reply({
                ephemeral: true,
                content: 'Just one more step! We need to verify your humanity!',
                components: [{
                    type: ComponentType.ActionRow,
                    components: [{
                        type: ComponentType.Button,
                        style: ButtonStyle.Link,
                        url: url,
                        label: 'Solve Captcha'
                    }]
                }]
            })
        })

}