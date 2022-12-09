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

const { ApplicationCommandType } = require('discord.js')
const player = require('../music/player')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'nowplaying',
    description: 'Show what\'s playing in Psychonaut Radio',
    type: ApplicationCommandType.ChatInput,
}

// Called whenever the command is being executed
module.exports.execute = async(client, interaction) => {

    let data = player.nowPlaying()

    interaction.reply({
        embeds: [{
            "color": 4078005,
            "thumbnail": {
                "url": data.thumbnails.maxres?.url || data.thumbnails.default?.url || 'https://i.imgur.com/z0VuHp8.png'
            },
            "fields": [{
                    "name": "Title",
                    "value": `[${data.title}](https://youtu.be/${data.resourceId.videoId})`
                },
                {
                    "name": "Uploaded By",
                    "value": `[${data.videoOwnerChannelTitle}](https://youtube.com/channel/${data.videoOwnerChannelId})`
                }
            ]
        }]
    })

}