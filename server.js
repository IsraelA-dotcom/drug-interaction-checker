const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

// Backup interaction database
const INTERACTION_DB = {
  'aspirin': {
    matches: ['warfarin', 'ibuprofen', 'naproxen', 'clopidogrel'],
    interactions: {
      'warfarin': { severity: 'high', description: 'Increased risk of bleeding. Aspirin enhances the anticoagulant effect of warfarin.' },
      'ibuprofen': { severity: 'moderate', description: 'Increased risk of gastrointestinal bleeding when used together.' },
      'naproxen': { severity: 'moderate', description: 'Increased risk of gastrointestinal bleeding.' },
      'clopidogrel': { severity: 'high', description: 'Significantly increased bleeding risk.' }
    }
  },
  'warfarin': {
    matches: ['aspirin', 'ibuprofen', 'naproxen', 'amoxicillin', 'clopidogrel'],
    interactions: {
      'aspirin': { severity: 'high', description: 'Increased risk of bleeding. Aspirin enhances the anticoagulant effect of warfarin.' },
      'ibuprofen': { severity: 'high', description: 'NSAIDs increase bleeding risk when combined with warfarin.' },
      'naproxen': { severity: 'high', description: 'Increased bleeding risk.' },
      'amoxicillin': { severity: 'moderate', description: 'May increase warfarin effect and INR levels.' },
      'clopidogrel': { severity: 'high', description: 'Severe bleeding risk.' }
    }
  },
  'ibuprofen': {
    matches: ['aspirin', 'warfarin', 'naproxen', 'lisinopril'],
    interactions: {
      'aspirin': { severity: 'moderate', description: 'Increased risk of gastrointestinal bleeding.' },
      'warfarin': { severity: 'high', description: 'NSAIDs increase bleeding risk when combined with warfarin.' },
      'naproxen': { severity: 'moderate', description: 'Increased GI bleeding risk when NSAIDs are combined.' },
      'lisinopril': { severity: 'moderate', description: 'May reduce effectiveness of blood pressure medication.' }
    }
  },
  'paracetamol': {
    matches: ['warfarin'],
    interactions: {
      'warfarin': { severity: 'moderate', description: 'High doses of paracetamol may increase warfarin effect.' }
    }
  },
  'acetaminophen': {
    matches: ['warfarin'],
    interactions: {
      'warfarin': { severity: 'moderate', description: 'High doses may increase warfarin effect.' }
    }
  },
  'naproxen': {
    matches: ['aspirin', 'warfarin', 'ibuprofen'],
    interactions: {
      'aspirin': { severity: 'moderate', description: 'Increased GI bleeding risk.' },
      'warfarin': { severity: 'high', description: 'Increased bleeding risk.' },
      'ibuprofen': { severity: 'moderate', description: 'Increased GI bleeding risk.' }
    }
  },
  'clopidogrel': {
    matches: ['aspirin', 'warfarin', 'omeprazole'],
    interactions: {
      'aspirin': { severity: 'high', description: 'Significantly increased bleeding risk.' },
      'warfarin': { severity: 'high', description: 'Severe bleeding risk.' },
      'omeprazole': { severity: 'high', description: 'Omeprazole reduces effectiveness of clopidogrel.' }
    }
  },
  'omeprazole': {
    matches: ['clopidogrel'],
    interactions: {
      'clopidogrel': { severity: 'high', description: 'Reduces effectiveness of clopidogrel.' }
    }
  },
  'lisinopril': {
    matches: ['ibuprofen', 'potassium'],
    interactions: {
      'ibuprofen': { severity: 'moderate', description: 'May reduce blood pressure control.' },
      'potassium': { severity: 'high', description: 'Risk of hyperkalemia (high potassium levels).' }
    }
  }
};

function findInDatabase(drug1Name, drug2Name) {
  const name1 = drug1Name.toLowerCase();
  const name2 = drug2Name.toLowerCase();
  
  
  for (let key of Object.keys(INTERACTION_DB)) {
    if (name1.includes(key)) {
      for (let matchKey of Object.keys(INTERACTION_DB)) {
        if (name2.includes(matchKey) && INTERACTION_DB[key].interactions[matchKey]) {
          return INTERACTION_DB[key].interactions[matchKey];
        }
      }
    }
  }
  return null;
}

app.get('/api/search', async (req, res) => {
  const { q } = req.query;
  
  if (!q || q.length < 2) {
    return res.status(400).json({ error: 'Query too short' });
  }

  try {
    const { data } = await axios.get(`${RXNORM_BASE}/drugs.json`, {
      params: { name: q }
    });

    let result = null;

    if (data.drugGroup?.conceptGroup) {
      for (let group of data.drugGroup.conceptGroup) {
        if (group.conceptProperties?.length > 0) {
          const drug = group.conceptProperties[0];
          result = { 
            rxcui: drug.rxcui, 
            name: drug.name.length > 50 ? q.charAt(0).toUpperCase() + q.slice(1) : drug.name
          };
          break;
        }
      }
    }

    if (!result) {
      const { data: approxData } = await axios.get(`${RXNORM_BASE}/approximateTerm.json`, {
        params: { term: q }
      });

      if (approxData.approximateGroup?.candidate?.length > 0) {
        const match = approxData.approximateGroup.candidate[0];
        result = { rxcui: match.rxcui, name: match.name };
      }
    }

    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: 'Drug not found' });
    }
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(500).json({ error: 'Search failed' });
  }
});

app.post('/api/interactions', async (req, res) => {
  const { drugs } = req.body;

  if (!drugs || drugs.length < 2) {
    return res.json([]);
  }

  const interactions = [];
  const checked = new Set();

  
  console.log('Checking built-in database...');
  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const interaction = findInDatabase(drugs[i].name, drugs[j].name);
      if (interaction) {
        const key = [drugs[i].rxcui, drugs[j].rxcui].sort().join('-');
        if (!checked.has(key)) {
          checked.add(key);
          interactions.push({
            source: drugs[i].rxcui,
            target: drugs[j].rxcui,
            severity: interaction.severity,
            description: interaction.description
          });
          console.log(`Found in database: ${drugs[i].name} <-> ${drugs[j].name}`);
        }
      }
    }
  }

  try {
    for (let i = 0; i < drugs.length; i++) {
      try {
        const { data } = await axios.get(
          `${RXNORM_BASE}/interaction/interaction.json`,
          { 
            params: { rxcui: drugs[i].rxcui },
            timeout: 5000
          }
        );

        if (data.interactionTypeGroup) {
          for (let typeGroup of data.interactionTypeGroup) {
            if (typeGroup.interactionType) {
              for (let interactionType of typeGroup.interactionType) {
                if (interactionType.interactionPair) {
                  for (let pair of interactionType.interactionPair) {
                    const concepts = pair.interactionConcept || [];
                    
                    for (let concept of concepts) {
                      const targetRxcui = concept.minConceptItem?.rxcui;
                      const targetDrug = drugs.find(d => d.rxcui === targetRxcui && d.rxcui !== drugs[i].rxcui);
                      
                      if (targetDrug) {
                        const key = [drugs[i].rxcui, targetRxcui].sort().join('-');
                        
                        if (!checked.has(key)) {
                          checked.add(key);
                          interactions.push({
                            source: drugs[i].rxcui,
                            target: targetRxcui,
                            severity: pair.severity?.toLowerCase() || 'moderate',
                            description: pair.description || 'Interaction detected'
                          });
                          console.log(`Found via API: ${drugs[i].name} <-> ${targetDrug.name}`);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (drugErr) {
      }
    }
  } catch (err) {
    console.error('API check error:', err.message);
  }

  console.log(`Total interactions found: ${interactions.length}`);
  res.json(interactions);
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
