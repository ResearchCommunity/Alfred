import { ApplyOptions } from '@sapphire/decorators';
import { Command } from '@sapphire/framework';
import { InteractionContextType, MessageFlags, roleMention } from 'discord.js';
import { resolveCountry, searchCountries } from '../countries.ts';
import { clearNationality, setNationality } from '../roles.ts';

@ApplyOptions<Command.Options>({
	name: 'nationality',
	description: 'Show where you are from with a country role',
})
export class NationalityCommand extends Command {
	public override registerApplicationCommands(registry: Command.Registry): void {
		registry.registerChatInputCommand((builder) =>
			builder
				.setName(this.name)
				.setDescription(this.description)
				.setContexts(InteractionContextType.Guild)
				.addSubcommand((sub) =>
					sub
						.setName('set')
						.setDescription('Get the role for your country (replaces your current one)')
						.addStringOption((option) =>
							option
								.setName('country')
								.setDescription('Country name or code')
								.setRequired(true)
								.setAutocomplete(true),
						),
				)
				.addSubcommand((sub) => sub.setName('clear').setDescription('Remove your nationality role')),
		);
	}

	public override async autocompleteRun(interaction: Command.AutocompleteInteraction): Promise<void> {
		const query = interaction.options.getFocused();
		await interaction.respond(
			searchCountries(query).map((country) => ({ name: `${country.flag} ${country.name}`, value: country.code })),
		);
	}

	public override async chatInputRun(interaction: Command.ChatInputCommandInteraction<'cached'>): Promise<void> {
		await interaction.deferReply({ flags: MessageFlags.Ephemeral });

		if (interaction.options.getSubcommand() === 'clear') {
			const removed = await clearNationality(interaction.member);
			await interaction.editReply(removed ? 'Your nationality role has been removed.' : "You don't have one.");
			return;
		}

		// Autocomplete sends the code, but people can also just type and hit enter
		const country = resolveCountry(interaction.options.getString('country', true));
		if (!country) {
			await interaction.editReply("I couldn't find that country. Pick one of the suggestions while typing.");
			return;
		}

		const role = await setNationality(interaction.member, country);
		await interaction.editReply(`You now have the ${roleMention(role.id)} role!`);
	}
}
