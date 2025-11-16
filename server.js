const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.static(__dirname));
app.use(cors());
app.use(express.json());

const RXNORM_BASE = 'https://rxnav.nlm.nih.gov/REST';

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

  try {
    for (let i = 0; i < drugs.length; i++) {
      console.log(`Checking interactions for ${drugs[i].name} (${drugs[i].rxcui})`);
      
      try {
        const { data } = await axios.get(
          `${RXNORM_BASE}/interaction/interaction.json`,
          { 
            params: { rxcui: drugs[i].rxcui },
            timeout: 10000
          }
        );

        console.log(`Response for ${drugs[i].name}:`, data.interactionTypeGroup ? 'Has interactions' : 'No interactions');

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
                          
                          const interaction = {
                            source: drugs[i].rxcui,
                            target: targetRxcui,
                            severity: pair.severity?.toLowerCase() || 'moderate',
                            description: pair.description || 'Interaction detected between these medications'
                          };
                          
                          console.log(`Found interaction: ${drugs[i].name} <-> ${targetDrug.name} (${interaction.severity})`);
                          interactions.push(interaction);
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
        console.error(`Error checking ${drugs[i].name}:`, drugErr.message);
      }
    }

    console.log(`Total interactions found: ${interactions.length}`);
    res.json(interactions);
  } catch (err) {
    console.error('Interaction check error:', err.message);
    res.status(500).json({ error: 'Failed to check interactions' });
  }
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
