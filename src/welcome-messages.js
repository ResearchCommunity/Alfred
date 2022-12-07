// Copyright (C) 2022  Xenorio
// See license in /LICENSE

// %user% gets replaced with a mention
let messages = [
    "A warm welcome to %user% ❤️",
    "%user% is now a fellow researcher 🧑‍🔬",
    "Welcome %user%! May the force be with you 💫",
    "%user%: \\*Enter stage left\\*",
    "Does anyone know %user%? If not, now's the time to change that!",
    "%user% is now ONE OF US! ONE OF US!"
]

module.exports.get = () => {
    return messages[Math.floor(Math.random() * messages.length)]
}