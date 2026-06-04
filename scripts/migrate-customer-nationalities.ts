import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const NATIONALITY_TO_COUNTRY: Record<string, string> = {
  'Afghan': 'Afghanistan', 'Albanian': 'Albania', 'Algerian': 'Algeria',
  'American': 'United States', 'Andorran': 'Andorra', 'Angolan': 'Angola',
  'Argentine': 'Argentina', 'Armenian': 'Armenia', 'Australian': 'Australia',
  'Austrian': 'Austria', 'Azerbaijani': 'Azerbaijan', 'Bahamian': 'Bahamas',
  'Bahraini': 'Bahrain', 'Bangladeshi': 'Bangladesh', 'Barbadian': 'Barbados',
  'Belarusian': 'Belarus', 'Belgian': 'Belgium', 'Belizean': 'Belize',
  'Beninese': 'Benin', 'Bhutanese': 'Bhutan', 'Bolivian': 'Bolivia',
  'Bosnian': 'Bosnia and Herzegovina', 'Botswanan': 'Botswana', 'Brazilian': 'Brazil',
  'British': 'United Kingdom', 'Bruneian': 'Brunei', 'Bulgarian': 'Bulgaria',
  'Burkinabe': 'Burkina Faso', 'Burmese': 'Myanmar', 'Burundian': 'Burundi',
  'Cambodian': 'Cambodia', 'Cameroonian': 'Cameroon', 'Canadian': 'Canada',
  'Cape Verdean': 'Cape Verde', 'Central African': 'Central African Republic',
  'Chadian': 'Chad', 'Chilean': 'Chile', 'Chinese': 'China',
  'Colombian': 'Colombia', 'Comorian': 'Comoros', 'Congolese': 'Congo',
  'Costa Rican': 'Costa Rica', 'Croatian': 'Croatia', 'Cuban': 'Cuba',
  'Cypriot': 'Cyprus', 'Czech': 'Czech Republic', 'Danish': 'Denmark',
  'Djiboutian': 'Djibouti', 'Dominican': 'Dominican Republic', 'Dutch': 'Netherlands',
  'East Timorese': 'East Timor', 'Ecuadorean': 'Ecuador', 'Egyptian': 'Egypt',
  'Emirati': 'United Arab Emirates', 'Equatorial Guinean': 'Equatorial Guinea',
  'Eritrean': 'Eritrea', 'Estonian': 'Estonia', 'Ethiopian': 'Ethiopia',
  'Fijian': 'Fiji', 'Finnish': 'Finland', 'French': 'France',
  'Gabonese': 'Gabon', 'Gambian': 'Gambia', 'Georgian': 'Georgia',
  'German': 'Germany', 'Ghanaian': 'Ghana', 'Greek': 'Greece',
  'Grenadian': 'Grenada', 'Guatemalan': 'Guatemala', 'Guinean': 'Guinea',
  'Guyanese': 'Guyana', 'Haitian': 'Haiti', 'Honduran': 'Honduras',
  'Hungarian': 'Hungary', 'Icelandic': 'Iceland', 'Indian': 'India',
  'Indonesian': 'Indonesia', 'Iranian': 'Iran', 'Iraqi': 'Iraq',
  'Irish': 'Ireland', 'Israeli': 'Israel', 'Italian': 'Italy',
  'Ivorian': 'Ivory Coast', 'Jamaican': 'Jamaica', 'Japanese': 'Japan',
  'Jordanian': 'Jordan', 'Kazakhstani': 'Kazakhstan', 'Kenyan': 'Kenya',
  'Korean': 'South Korea', 'Kosovar': 'Kosovo', 'Kuwaiti': 'Kuwait',
  'Kyrgyz': 'Kyrgyzstan', 'Laotian': 'Laos', 'Latvian': 'Latvia',
  'Lebanese': 'Lebanon', 'Liberian': 'Liberia', 'Libyan': 'Libya',
  'Liechtenstein': 'Liechtenstein', 'Lithuanian': 'Lithuania', 'Luxembourgish': 'Luxembourg',
  'Macedonian': 'North Macedonia', 'Malagasy': 'Madagascar', 'Malawian': 'Malawi',
  'Malaysian': 'Malaysia', 'Maldivian': 'Maldives', 'Malian': 'Mali',
  'Maltese': 'Malta', 'Mauritanian': 'Mauritania', 'Mauritian': 'Mauritius',
  'Mexican': 'Mexico', 'Moldovan': 'Moldova', 'Monacan': 'Monaco',
  'Mongolian': 'Mongolia', 'Montenegrin': 'Montenegro', 'Moroccan': 'Morocco',
  'Mozambican': 'Mozambique', 'Namibian': 'Namibia', 'Nepalese': 'Nepal',
  'New Zealander': 'New Zealand', 'Nicaraguan': 'Nicaragua', 'Nigerian': 'Nigeria',
  'Nigerien': 'Niger', 'Norwegian': 'Norway', 'Omani': 'Oman',
  'Pakistani': 'Pakistan', 'Palauan': 'Palau', 'Panamanian': 'Panama',
  'Papua New Guinean': 'Papua New Guinea', 'Paraguayan': 'Paraguay', 'Peruvian': 'Peru',
  'Filipino': 'Philippines', 'Polish': 'Poland', 'Portuguese': 'Portugal',
  'Qatari': 'Qatar', 'Romanian': 'Romania', 'Russian': 'Russia',
  'Rwandan': 'Rwanda', 'Saint Lucian': 'Saint Lucia', 'Salvadoran': 'El Salvador',
  'Samoan': 'Samoa', 'Saudi': 'Saudi Arabia', 'Senegalese': 'Senegal',
  'Serbian': 'Serbia', 'Sierra Leonean': 'Sierra Leone', 'Singaporean': 'Singapore',
  'Slovak': 'Slovakia', 'Slovenian': 'Slovenia', 'Somali': 'Somalia',
  'South African': 'South Africa', 'South Sudanese': 'South Sudan', 'Spanish': 'Spain',
  'Sri Lankan': 'Sri Lanka', 'Sudanese': 'Sudan', 'Surinamese': 'Suriname',
  'Swazi': 'Swaziland', 'Swedish': 'Sweden', 'Swiss': 'Switzerland',
  'Syrian': 'Syria', 'Taiwanese': 'Taiwan', 'Tajik': 'Tajikistan',
  'Tanzanian': 'Tanzania', 'Thai': 'Thailand', 'Togolese': 'Togo',
  'Trinidadian': 'Trinidad and Tobago', 'Tunisian': 'Tunisia', 'Turkish': 'Turkey',
  'Turkmen': 'Turkmenistan', 'Ugandan': 'Uganda', 'Ukrainian': 'Ukraine',
  'Uruguayan': 'Uruguay', 'Uzbek': 'Uzbekistan', 'Venezuelan': 'Venezuela',
  'Vietnamese': 'Vietnam', 'Yemeni': 'Yemen', 'Zambian': 'Zambia',
  'Zimbabwean': 'Zimbabwe',
}

async function main() {
  const customers = await db.customer.findMany({
    where: { nationality: { not: null } },
    select: { id: true, nationality: true },
  })

  console.log(`Found ${customers.length} customers with nationality set`)

  let updated = 0
  let skipped = 0

  for (const c of customers) {
    const from = c.nationality!
    const to   = NATIONALITY_TO_COUNTRY[from]
    if (!to || to === from) { skipped++; continue }
    await db.customer.update({ where: { id: c.id }, data: { nationality: to } })
    console.log(`  ${from} → ${to}`)
    updated++
  }

  console.log(`\nDone: ${updated} updated, ${skipped} skipped`)
}

main().catch(console.error).finally(() => db.$disconnect())
