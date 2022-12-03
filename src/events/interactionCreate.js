// Copyright (C) 2022  Xenorio
// See license in /LICENSE

const fs = require('fs')

module.exports = async(client, interaction) => {

    switch (interaction.type) {
        case 1:
            // Ping Interaction
            break;

        case 2:
            // Command Interaction
            if (!fs.existsSync(`./src/commands/${interaction.data.name}.js`)) return
            require(`../commands/${interaction.data.name}.js`).execute(client, interaction)
            break;

        case 3:
            // Component Interaction
            break;

        default:
            break;
    }

}