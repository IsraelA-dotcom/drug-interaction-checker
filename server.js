const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = 3001;

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
          result = { rxcui: drug.rxcui, name: drug.name };
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
      const { data } = await axios.get(`${RXNORM_BASE}/interaction/interaction.json`, {
        params: { rxcui: drugs[i].rxcui }
      });

      if (!data.interactionTypeGroup) continue;

      for (let typeGroup of data.interactionTypeGroup) {
        if (!typeGroup.interactionType) continue;

        for (let interactionType of typeGroup.interactionType) {
          if (!interactionType.interactionPair) continue;

          for (let pair of interactionType.interactionPair) {
            const concepts = pair.interactionConcept || [];
            
            for (let concept of concepts) {
              const targetRxcui = concept.minConceptItem?.rxcui;
              const targetDrug = drugs.find(d => d.rxcui === targetRxcui);

              if (targetDrug && targetDrug.rxcui !== drugs[i].rxcui) {
                const key = [drugs[i].rxcui, targetRxcui].sort().join('-');
                
                if (!checked.has(key)) {
                  checked.add(key);
                  interactions.push({
                    source: drugs[i].rxcui,
                    target: targetRxcui,
                    severity: pair.severity?.toLowerCase() || 'moderate',
                    description: pair.description
                  });
                }
                break;
              }
            }
          }
        }
      }
    }

    res.json(interactions);
  } catch (err) {
    console.error('Interaction check error:', err.message);
    res.status(500).json({ error: 'Failed to check interactions' });
  }
});

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/index.html');
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

