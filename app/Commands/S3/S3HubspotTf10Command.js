import axios from "axios";
import {
    S3Client,
    PutObjectCommand,
} from "@aws-sdk/client-s3";

const HUBSPOT_BASE_URL = "https://api.hubapi.com";
const HUBSPOT_COMPANY_LIST_V3_URL = `${HUBSPOT_BASE_URL}/crm/v3/objects/companies`;
const HUBSPOT_COMPANY_DETAIL_V3_URL = (companyId) => `${HUBSPOT_BASE_URL}/crm/v3/objects/companies/${companyId}`;
const HUBSPOT_COMPANY_LIST_LEGACY_URL = `${HUBSPOT_BASE_URL}/companies/v2/companies/paged`;
const HUBSPOT_COMPANY_DETAIL_LEGACY_URL = (companyId) => `${HUBSPOT_BASE_URL}/companies/v2/companies/${companyId}`;
const TARGET_BUCKET = "unifaat-teste";

const buildHubspotHeaders = (hubspotToken) => ({
    Authorization: `Bearer ${hubspotToken}`,
});

const listAllCompanyIdsByBearer = async (hubspotToken) => {
    const ids = [];

    let after = null;

    while (true) {
        const response = await axios.get(HUBSPOT_COMPANY_LIST_V3_URL, {
            headers: buildHubspotHeaders(hubspotToken),
            params: {
                limit: 100,
                ...(after ? { after } : {}),
            },
        });

        const companies = response.data?.results || [];

        for (const company of companies) {
            if (company?.id !== undefined && company?.id !== null) {
                ids.push(String(company.id));
            }
        }

        const nextAfter = response.data?.paging?.next?.after;

        if (!nextAfter) {
            break;
        }

        after = nextAfter;
    }

    return [...new Set(ids)];
};

const listAllCompanyIdsByApiKey = async (hubspotApiKey) => {
    const ids = [];

    let hasMore = true;
    let offset = 0;

    while (hasMore) {
        const response = await axios.get(HUBSPOT_COMPANY_LIST_LEGACY_URL, {
            params: {
                limit: 100,
                offset,
                hapikey: hubspotApiKey,
            },
        });

        const companies = response.data?.companies || [];

        for (const company of companies) {
            if (company?.companyId !== undefined && company?.companyId !== null) {
                ids.push(String(company.companyId));
            }
        }

        hasMore = Boolean(response.data?.hasMore);
        offset = response.data?.offset;

        if (hasMore && (offset === undefined || offset === null)) {
            throw new Error("Falha na paginação da listagem de companies do HubSpot (legado).");
        }
    }

    return [...new Set(ids)];
};

const getCompanyJsonByBearer = async (hubspotToken, companyId) => {
    const response = await axios.get(HUBSPOT_COMPANY_DETAIL_V3_URL(companyId), {
        headers: buildHubspotHeaders(hubspotToken),
    });

    return response.data;
};

const getCompanyJsonByApiKey = async (hubspotApiKey, companyId) => {
    const response = await axios.get(HUBSPOT_COMPANY_DETAIL_LEGACY_URL(companyId), {
        params: {
            hapikey: hubspotApiKey,
        },
    });

    return response.data;
};

export default {
    name: "integracao-s3-hubspot",
    description: "Lê companies do HubSpot e salva cada JSON no bucket S3 unifaat-teste",

    arguments: {
        ra: {
            required: false,
            description: "RA do aluno para criar o diretório no S3 (também pode vir da variável RA)",
        },
    },

    handle: async function ({ ra } = {}) {
        try {
            const hubspotToken = String(process.env.HUBSPOT_API_TOKEN || "").trim();
            const hubspotApiKey = String(process.env.HUBSPOT_API_KEY || "").trim();

            if (!hubspotToken && !hubspotApiKey) {
                throw new Error("Defina HUBSPOT_API_TOKEN (Bearer) ou HUBSPOT_API_KEY (legado) nas variáveis de ambiente.");
            }

            const registrationNumber = String(ra || process.env.RA || "").trim();
            if (!registrationNumber) {
                throw new Error('Informe seu RA com "--ra=123456" ou configure a variável de ambiente RA.');
            }

            if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
                throw new Error("Credenciais AWS não encontradas nas variáveis de ambiente.");
            }

            const region = process.env.AWS_REGION || "sa-east-1";

            const s3Client = new S3Client({
                region: region,
                credentials: {
                    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
                },
            });

            console.log("Buscando companies no HubSpot...");

            let authMode = "bearer";
            let hubspotCredential = hubspotToken;
            let companyIds = [];

            if (hubspotToken) {
                try {
                    companyIds = await listAllCompanyIdsByBearer(hubspotToken);
                } catch (error) {
                    const authError = error?.response?.status === 401 || error?.response?.status === 403;

                    if (!authError || (!hubspotApiKey && !hubspotToken)) {
                        throw error;
                    }

                    authMode = "hapikey";
                    hubspotCredential = hubspotApiKey || hubspotToken;

                    console.log("Token Bearer rejeitado. Tentando integração legada com API key...");
                    companyIds = await listAllCompanyIdsByApiKey(hubspotCredential);
                }
            } else {
                authMode = "hapikey";
                hubspotCredential = hubspotApiKey;
                companyIds = await listAllCompanyIdsByApiKey(hubspotCredential);
            }

            if (!companyIds.length) {
                console.log("Nenhuma company encontrada no HubSpot.");

                return {
                    success: true,
                    message: "Nenhuma company para exportar.",
                    uploaded: 0,
                    bucket: TARGET_BUCKET,
                };
            }

            console.log(`${companyIds.length} companies encontradas. Iniciando upload para S3...`);

            let uploaded = 0;

            for (const companyId of companyIds) {
                const companyJson = authMode === "bearer"
                    ? await getCompanyJsonByBearer(hubspotCredential, companyId)
                    : await getCompanyJsonByApiKey(hubspotCredential, companyId);

                const objectKey = `${registrationNumber}/${companyId}.json`;

                await s3Client.send(
                    new PutObjectCommand({
                        Bucket: TARGET_BUCKET,
                        Key: objectKey,
                        Body: JSON.stringify(companyJson, null, 2),
                        ContentType: "application/json",
                    })
                );

                uploaded += 1;
                console.log(`[${uploaded}/${companyIds.length}] Upload concluído: ${objectKey}`);
            }

            return {
                success: true,
                bucket: TARGET_BUCKET,
                uploaded,
                totalCompanies: companyIds.length,
                message: "Exportação concluída com sucesso.",
            };
        } catch (error) {
            console.error("Erro ao executar integração S3 + HubSpot:", error.message || error);

            if (error?.response?.data) {
                console.error("Detalhes da API HubSpot:", error.response.data);
            }

            return {
                success: false,
                message: error.message,
            };
        }
    },
};