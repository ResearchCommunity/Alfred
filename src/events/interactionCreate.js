// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const fs = require('fs')
const { InteractionType } = require('discord.js')

module.exports = async(client, interaction) => {

    switch (interaction.type) {

        case InteractionType.ApplicationCommand:
            if (!fs.existsSync(`./src/commands/${interaction.commandName}.js`)) return
            require(`../commands/${interaction.commandName}.js`).execute(client, interaction)
            break;

        case InteractionType.MessageComponent:
            if (!fs.existsSync(`./src/components/${interaction.customId}.js`)) return
            require(`../components/${interaction.customId}.js`).execute(client, interaction)
            break;

        default:
            break;
    }

}