# Alfred the Butler
General Purpose Discord Bot for the Research Community

## Dev Environment

### Requirements
- Discord Application
- NodeJS >=17
- C/C++ Build Tools
- Preferably Linux

### Setup
- Clone the repository
- Install dependencies with ``npm install``
- Copy ``config.default.js`` to ``config.js``
- Edit the config
- Run the bot with ``npm start``

### Note
Running the captcha functionality in a dev environment is a bit tricky. If you really need to, you will need to edit the site key in ``src/api/captcha.html`` and ``src/api/routes/solve.js`` to your own hCaptcha key. Then, because of hCaptcha hostname verification, you'll need to either host this on an actual domain, or locally route the domain (which you don't need to own in this case) to localhost (hosts file, pihole, whatever).

## Using this yourself
Please remember that this bot is tailored to the needs of a specific Discord server, and does not have any use outside of that in mind. While you can certainly use this for your own purposes, any feature could dramatically change or be removed at any point, and there is no guarantee of any support. If you do decide to run it on your own server however, please remember that this is AGPLv3 licensed. This means that, among other things, as soon as you put any modifications into a public instance, you will need to release the source code under the same license (preferably as a fork).