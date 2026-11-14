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

// Exports the data the rewrite needs (nationality roles, watched threads) as a
// JSON file, to be imported with the new bot's /migrate command at cutover.

const { ApplicationCommandType, AttachmentBuilder, PermissionFlagsBits } = require('discord.js')
const mongo = require('../mongo')
const config = require('../../config')

module.exports.info = {
    name: 'migrate',
    description: 'Export data for the new Alfred',
    type: ApplicationCommandType.ChatInput,
    default_member_permissions: PermissionFlagsBits.Administrator.toString()
}

module.exports.execute = async (client, interaction) => {

    const countryRoles = (await mongo.query('CountryRoles', {})) || []
    const threads = (await mongo.query('Threads', { watched: true })) || []

    const data = {
        format: 'alfred-migration',
        version: 1,
        exportedAt: new Date().toISOString(),
        guildId: config.guild,
        nationalityRoles: countryRoles
            .filter(x => x.alpha2 && x.id)
            .map(x => ({ country: String(x.alpha2).toUpperCase(), roleId: String(x.id) })),
        watchedThreads: threads.map(x => String(x.id))
    }

    interaction.reply({
        ephemeral: true,
        content: `Exported ${data.nationalityRoles.length} nationality role(s) and ${data.watchedThreads.length} watched thread(s). Import this file with \`/migrate\` on the new Alfred.`,
        files: [new AttachmentBuilder(Buffer.from(JSON.stringify(data, null, 2)), { name: 'alfred-migration.json' })]
    })

}
