// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { ComponentType, ButtonStyle } = require('discord.js');
const config = require('../../config');

module.exports.execute = async(client, interaction) => {

    switch (interaction.values[0]) {
        case 'ticket-creation-message':
            interaction.channel.send({
                content: 'Is your trip going south? Need some assistance or just someone to talk to? Our volunteer tripsitters are here for you!',
                components: [{
                    type: ComponentType.ActionRow,
                    components: [{
                        type: ComponentType.Button,
                        style: ButtonStyle.Primary,
                        custom_id: 'ticket-create',
                        label: 'Tripsit Me!'
                    }]
                }]
            }).then(() => interaction.reply({
                content: 'Message successfully created!',
                ephemeral: true
            }))
            break;

        case 'rule-message':
            interaction.channel.send({
                embeds: [config.onboarding.rules.embed],
                components: [{
                    type: ComponentType.ActionRow,
                    components: [{
                            type: ComponentType.Button,
                            style: ButtonStyle.Success,
                            custom_id: 'rules-accept',
                            label: '👍 Accept'
                        },
                        {
                            type: ComponentType.Button,
                            style: ButtonStyle.Danger,
                            custom_id: 'rules-decline',
                            label: '👎 Decline'
                        }
                    ]
                }]
            }).then(() => interaction.reply({
                content: 'Message successfully created!',
                ephemeral: true
            }))
            break;

        default:
            break;
    }

}