'use strict';
// Display names only. These do not alter ability effects.
const names={
 iron_man_legendary:'Armored Alliance',iron_man_epic:'Arc Support',iron_man_rare:'Threat Scan',
 spider_man_legendary:'Web Exchange',spider_man_epic:'Web Relocation',spider_man_rare:'Spider Family',
 hulk_legendary:'Hulk Smash',hulk_epic:'Unstoppable',hulk_rare:'Gamma Family',
 thor_legendary:'Thunder Strike',thor_epic:'Shield Breaker',thor_rare:'Asgardian Bond',
 thanos_legendary:'The Snap',captain_america_legendary:'Avengers Assemble',captain_america_epic:'Hold the Line',
 hawkeye_legendary:'Perfect Shot',hawkeye_epic:'Piercing Arrow',hawkeye_rare:'Original Avengers',
 black_widow_legendary:'Weapon Sabotage',black_widow_epic:'Covert Support',black_widow_rare:'Avengers Bond',
 venom_legendary:'Symbiotic Gift',venom_epic:'Spider Hunter',wolverine_legendary:'Adamantium Resolve',
 wolverine_epic:'Healing Factor',wolverine_rare:'Mutant Brotherhood',scarlet_witch_legendary:'Reality Rewrite',
 scarlet_witch_epic:'Chaos Reflection',scarlet_witch_rare:'Mystic Bond',loki_legendary:'Trickster Exchange',loki_epic:'Power Theft',
 daredevil_legendary:'Guardian of the City',daredevil_epic:'Precision Strike',daredevil_rare:"Hell's Kitchen Bond",
 punisher_legendary:'Suppressing Fire',punisher_epic:'Lockdown',doctor_strange_legendary:'Dimension Shift',doctor_strange_epic:'Sling Ring',
 black_panther_legendary:'Wakandan Defense',black_panther_epic:'Strength in Numbers',silver_surfer_epic:'Cosmic Return',
 silver_surfer_rare:'Cosmic Alliance',doctor_doom_epic:'Doom Transmutation',spider_man_2099_legendary:'Spider-Verse Network',
 miles_morales_legendary:'Untouchable Spider',deadpool_legendary:'Take It on the Chin',knull_legendary:'Symbiote Annihilation',
 galactus_epic:'World Eater',reed_richards_epic:'Elastic Support',sue_storm_epic:'Invisible Intelligence',human_torch_epic:'Flame On',the_thing_epic:"It's Clobberin' Time"
};
const abilityName=key=>names[key]??'Card Ability';
module.exports={names,abilityName};
