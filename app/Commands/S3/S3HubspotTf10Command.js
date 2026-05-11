import {
    S3Client,
    CreateBucketCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";



export default {
    name: "integracao-s3-hubspot",
    description: "",

    arguments: {

    },

    handle: async function () {
        try {
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


            /** TF 10 */
        } catch (error) {
            console.error("Erro ao criar bucket ou inserir arquivo:", error);
        }
    },
};