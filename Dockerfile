# Usando a imagem oficial do Node.js como base
FROM node:18-alpine

# Definindo o diretório de trabalho dentro do container
WORKDIR /app

# Instalar curl (agora você pode testar as requisições dentro do container)
RUN apk add --no-cache curl

# Instalar aws-cli para validar operações de aws
RUN npm install -g aws-cli

# Copia os arquivos package.json e package-lock.json antes de instalar dependências
COPY package*.json ./

# Instala apenas dependências de produção
RUN npm install

# Copia o restante do código para dentro do container
COPY . .

# Expõe a porta 3000 (a mesma que o Nest usa por padrão)
EXPOSE 3000

# # Definindo a variável de ambiente para permitir acesso externo
# ENV HOST=0.0.0.0

# Comando para iniciar a aplicação
CMD ["npm", "run", "start"]
