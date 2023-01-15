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

const { ApplicationCommandType, ApplicationCommandOptionType } = require('discord.js')
const countries = require('country-data').countries
const mongo = require('../mongo')
const config = require('../../config')

// Passed to Discord when registering the command
// https://discord.com/developers/docs/interactions/application-commands#application-command-object
module.exports.info = {
    name: 'nationality',
    description: 'Get a nationality role!',
    type: ApplicationCommandType.ChatInput,
    options: [{
        type: ApplicationCommandOptionType.String,
        name: 'query',
        description: 'Country name or code',
        required: true
    }]
}

// Called whenever the command is being executed
module.exports.execute = async(client, interaction) => {

    let guildRoles = await interaction.guild.roles.fetch()

    let query = interaction.options.getString('query', true).toUpperCase()

    let results = countries.all.filter(x => {
        if (
            x.alpha2 == query ||
            x.alpha3 == query ||
            x.ioc == query ||
            x.name.toUpperCase() == query
        ) {
            return true
        } else {
            return false
        }
    })

    if (!results[0]) return interaction.reply({
        content: 'I could not find a country using that query!\n\nWhen in doubt, use a [country code](https://en.wikipedia.org/wiki/List_of_ISO_3166_country_codes) in Alpha-2 or Alpha-3 format!',
        ephemeral: true
    })

    let country = results[0]

    let roledata = await mongo.queryOne('CountryRoles', { alpha2: country.alpha2 })

    let role

    if (roledata) {
        role = await interaction.guild.roles.fetch(roledata.id)
    }

    if (!role) {
        if (roledata) {
            mongo.delete('CountryRoles', { alpha2: country.alpha2 }).catch(() => {})
            roledata = false
        }
        role = await interaction.guild.roles.create({
            name: `${country.emoji} ${country.name}`,
            color: '#' + (Math.random() * 0xFFFFFF << 0).toString(16).padStart(6, '0'), // Random hex color
            position: guildRoles.get(config.onboarding.verifiedRole).position - 1
        })
    }

    if (!role) return interaction.reply({
        content: 'Whoops! I could not find or create a role. This should not happen. Please contact <@615943893703458837>',
        ephemeral: true
    })

    if (!roledata) mongo.insert('CountryRoles', {
        name: country.name,
        alpha2: country.alpha2,
        id: role.id
    })

    let member = await interaction.member.fetch()

    member.roles.add(role)

    interaction.reply({
        content: `You now have the <@&${role.id}> role!`,
        ephemeral: true
    })

    // Remove any other country roles the member already has
    member.roles.cache.forEach(x => {
        if (role.id == x.id) return
        mongo.queryOne('CountryRoles', { id: x.id })
            .then(data => {
                if (data) {
                    if (guildRoles.get(x.id).members.size - 1 <= 0) {
                        mongo.delete('CountryRoles', { id: x.id })
                        x.delete()
                    } else {
                        member.roles.remove(x)
                    }
                }
            })
    })

}