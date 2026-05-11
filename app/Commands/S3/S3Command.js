import {
    S3Client,
    CreateBucketCommand,
    PutObjectCommand,
} from "@aws-sdk/client-s3";



export default {
    name: "s3",
    description: "Cria um bucket S3 e insere um arquivo TXT dentro dele",

    arguments: {
        bucket: {
            required: true,
            description: "Nome do bucket que será criado",
        },

        file: {
            required: false,
            description: "Nome do arquivo TXT",
            default: "arquivo.txt",
        },

        content: {
            required: false,
            description: "Conteúdo do arquivo TXT",
            default: "Arquivo criado via command Node.js",
        },
    },

    handle: async function ({
        bucket,
        file = "arquivo.txt",
        content = "Arquivo criado via command Node.js",
    }) {
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

            console.log(`Criando bucket: ${bucket}`);

            const createBucketParams = {
                Bucket: bucket,
            };

            /**
             * Como sua região é sa-east-1,
             * precisa informar LocationConstraint.
             */
            if (region !== "us-east-1") {
                createBucketParams.CreateBucketConfiguration = {
                    LocationConstraint: region,
                };
            }

            await s3Client.send(
                new CreateBucketCommand(createBucketParams)
            );

            console.log("Bucket criado com sucesso.");

            console.log(`Enviando arquivo ${file} para o bucket ${bucket}`);

            await s3Client.send(
                new PutObjectCommand({
                    Bucket: bucket,
                    Key: file,
                    Body: content,
                    ContentType: "text/plain",
                })
            );

            console.log("Arquivo enviado com sucesso.");

            return {
                success: true,
                bucket,
                file,
                region,
                message: `Bucket ${bucket} criado em ${region} e arquivo ${file} enviado com sucesso.`,
            };
        } catch (error) {
            console.error("Erro ao executar command S3:", error.message);

            return {
                success: false,
                message: error.message,
            };
        }
    },
};