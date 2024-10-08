// Copyright (C) 2023 Marcus Huber (xenorio) <dev@xenorio.xyz>
// 
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as
// published by the Free Software Foundation, either version 3 of the
// License, or (at your option) any later version.
// 
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU Affero General Public License for more details.
// 
// You should have received a copy of the GNU Affero General Public License
// along with this program.  If not, see <http://www.gnu.org/licenses/>.

const trackers = require('../trackers')

module.exports = async (client, message) => {

	if (message.author.bot) return

	const URLRegex = new RegExp(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi)

	const URLMatches = message.content.match(URLRegex)

	let sanitizedMessage = message.content

	sanitizedMessage = sanitizedMessage.replaceAll('@everyone', '').replaceAll('@here', '')

	if (URLMatches) {
		for (url of URLMatches) {
			const newURL = trackers.test(url)
			if (newURL) {
				sanitizedMessage = sanitizedMessage.replaceAll(url, newURL)
			}
		}
	}

	if (sanitizedMessage != message.content) {
		message.delete()
		await message.channel.send(sanitizedMessage)
		message.channel.send({
			embeds: [
				{
					description: `The original message by <@${message.author.id}> contained one or more links with nasty trackers. I went ahead and cleaned them up 🧹`,
					color: 8461854
				}
			]
		}).then(indicatorMsg => {
			setTimeout(() => {
				indicatorMsg.edit({
					embeds: [
						{
							description: `By <@${message.author.id}>`,
							color: 8461854
						}
					]
				})
			}, 5*1000)
		})
	}

}