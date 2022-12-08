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