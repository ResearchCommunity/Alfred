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

const { ApplicationCommandType, ApplicationCommandOptionType, PermissionFlagsBits } = require('discord.js')
const mongo = require('../mongo')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'sudo',
    description: 'Secret Developer Command',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
    options: [{
        type: ApplicationCommandOptionType.String,
        name: 'command',
        description: 'code to run',
        required: true
    }]
}

// Called whenever the command is being executed
module.exports.execute = async(client, interaction) => {

    if (interaction.member.id != "615943893703458837") return interaction.reply({
        content: 'You are not allowed to do that!',
        ephemeral: true
    })

    let output = ""

    try {
        output = eval(interaction.options.getString('command'))
    } catch (error) {
        output += "\n" + error
    }

    interaction.reply({
        content: '```\n' + output + '\n```',
        ephemeral: true
    })

}