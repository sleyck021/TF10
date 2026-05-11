import axios from "axios";

export default {

    name: 'hubspot-company-create',
    description: 'Create Company in Hubspot',
    arguments: {

    },

    handle: async function () {
        const hubspotToken = process.env.HUBSPOT_API_TOKEN;
        if (!hubspotToken) {
            console.error('HUBSPOT_API_TOKEN is not set in the environment variables.');
            return;
        }

        const url = `https://api.hubapi.com/crm/v3/objects/companies`;

        const response = await axios.post(url, {
            properties: {
                name: `Empresa Teste ${Date.now()}`,
                address: 'Rua das Flores, 123',
                city: 'Sao Paulo'
            }
        }, {
            headers: {
                Authorization: `Bearer ${hubspotToken}`
            }
        });

        console.log(response.data);
    }
}