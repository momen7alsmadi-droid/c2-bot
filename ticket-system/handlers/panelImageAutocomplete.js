/**
 * =========================================================
 *  handlers/panelImageAutocomplete.js
 * =========================================================
 * Autocomplete لأمر /رفع-صورة: عند كتابة الإداري جزءاً من اسم
 * البنل تظهر له قائمة مقترحات من البنلات الموجودة فعلاً.
 * =========================================================
 */

const { getAllPanels } = require('../database/panelsDB');

/**
 * @param {import('discord.js').AutocompleteInteraction} interaction
 */
async function handlePanelImageAutocomplete(interaction) {
    const focused = interaction.options.getFocused();
    const query = String(focused || '').trim();

    const choices = getAllPanels()
        .map(p => ({ name: p.name.slice(0, 100), value: p.name }))
        .filter(c => !query || c.name.includes(query))
        .slice(0, 25);

    await interaction.respond(choices);
}

module.exports = { handlePanelImageAutocomplete };
