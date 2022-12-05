// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const { ComponentType, ButtonStyle } = require('discord.js')

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

        default:
            break;
    }

}