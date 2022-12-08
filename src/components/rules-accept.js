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