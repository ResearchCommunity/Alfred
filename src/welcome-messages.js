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

// %user% gets replaced with a mention
let messages = [
    "A warm welcome to %user% ❤️",
    "%user% is now a fellow researcher 🧑‍🔬",
    "Welcome %user%! May the force be with you 💫",
    "%user%: \\*enter stage left\\*",
    "Does anyone know %user%? If not, now's the time to change that!",
    "%user% is now ONE OF US! ONE OF US!",
    "%user% has descended onto the server!",
    "May I introduce everyone to %user%?",
    "It's getting hot in here 🔥 %user% just arrived!",
    "Roses are red, violets are blue, %user% just joined, and I can't rhyme",
    "This server has been sponsored by Raid Shadow Legends. Oh, and by %user%",
    "%user% just left. If it was opposite day, that is.",
    "🤖 Beep Boop EVENT_USER_JOIN %user% ; DESTROY_ALL_HUMANS_INIT Boop Beep 🤖",
    "EVERYONE QUIET! %user% is here!",
    "Finally, after all these years, %user% has joined!"
]

module.exports.get = () => {
    return messages[Math.floor(Math.random() * messages.length)]
}