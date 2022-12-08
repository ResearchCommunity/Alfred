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

const mongo = require('../mongo')

module.exports.execute = async(client, interaction) => {

    if (!(await mongo.queryOne('Tickets', { channel: interaction.channel.id }))) {
        interaction.reply({
            content: `<@615943893703458837>\n\n<@${interaction.member.id}> issued "ticket-delete" component outside of ticket. Please check what happened.`
        })
        return
    }

    mongo.delete('Tickets', { channel: interaction.channel.id })

    interaction.channel.delete()

}