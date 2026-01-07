/* =========================================================================
 * ⚙️ CONFIGURAÇÕES E IMPORTS GLOBAIS (VERSÃO NODE.JS STANDALONE)
 * ========================================================================= */

const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const busboy = require("busboy");
const path = require("path");
const os = require("os");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

// Arquivo de Permissões (Certifique-se de que o arquivo está na raiz)
const serviceAccount = require("./permisions.json");

/* -------------------------------------------------------------------------
 * 🚀 INICIALIZAÇÃO DO FIREBASE ADMIN
 * ------------------------------------------------------------------------- */

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  storageBucket: "api-prime-bank.firebasestorage.app",
});

const database = admin.firestore();
const bucket = admin.storage().bucket();

/* -------------------------------------------------------------------------
 * 🌐 CONFIGURAÇÃO DO SERVIDOR EXPRESS
 * ------------------------------------------------------------------------- */

const app = express();

// Middlewares padrão
app.use(cors({ origin: true }));
app.use(express.json()); // Essencial para ler req.body em APIs Node padrão

/* -------------------------------------------------------------------------
 * 🛡️ MIDDLEWARE DE AUTENTICAÇÃO
 * ------------------------------------------------------------------------- */

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).send({
      message: "Acesso negado. Token não fornecido ou formato inválido.",
    });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error("Erro ao verificar o Token:", error);
    return res.status(401).send({ message: "Token inválido ou expirado." });
  }
};

/* =========================================================================
 * 🛣️ ROTAS DA API
 * ========================================================================= */

// Rota de Teste (Health Check)
app.get("/", (req, res) => {
  res.send("API Prime Bank rodando em Node.js!");
});

// CREATE USER
app.post("/users", async (req, res) => {
  const { fullName, email, password, telephone, acceptTermAndPolice } =
    req.body;

  try {
    const userRecord = await admin.auth().createUser({
      email,
      password,
      displayName: fullName,
    });

    const userDocRef = database.collection("users").doc(userRecord.uid);
    await userDocRef.set({
      fullName,
      email,
      telephone,
      acceptTermAndPolice,
      createdAt: new Date().toISOString(),
    });

    const newAccountData = {
      associatedUser: userRecord.uid,
      name: fullName,
      balance: 4000,
      createdAt: new Date().toISOString(),
    };

    const accountRef = await database
        .collection("bankAccounts")
        .add(newAccountData);

    return res.status(200).send({
      message: "Usuário e Conta Principal criados com sucesso!",
      userId: userRecord.uid,
      bankAccountId: accountRef.id,
      bankAccountNumber: crypto.randomUUID(),
    });
  } catch (error) {
    console.error(error);
    return res.status(500).send(error);
  }
});

// READ ALL USERS
app.get("/users", authenticate, async (req, res) => {
  try {
    const querySnapshot = await database.collection("users").get();
    const response = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));
    return res.status(200).send(response);
  } catch (error) {
    return res
        .status(500)
        .send({ message: "Erro ao buscar usuários", error: error.message });
  }
});

// read user by ID
app.get("/user/:id", authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = database.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Usuário não encontrado." });
    }

    const userData = {
      ...doc.data(),
    };
    return res.status(200).send(userData);
  } catch (error) {
    console.error("Erro ao buscar usuário:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar usuário.",
      error: error.message,
    });
  }
});

// Update user
app.put("/users/:id", authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = req.body;
    const userRef = database.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Usuário não encontrado." });
    }

    await userRef.update(updateData);

    return res.status(200).send({
      message: `Usuário com ID ${userId} atualizado com sucesso.`,
      id: userId,
    });
  } catch (error) {
    console.error("Erro ao atualizar usuário:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao atualizar.",
      error: error.message,
    });
  }
});

// Delete user
app.delete("/users/:id", authenticate, async (req, res) => {
  try {
    const userId = req.params.id;
    const userRef = database.collection("users").doc(userId);
    const doc = await userRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Usuário não encontrado." });
    }

    await userRef.delete();

    return res.status(200).send({
      message: `Usuário com ID ${userId} excluído com sucesso.`,
      id: userId,
    });
  } catch (error) {
    console.error("Erro ao excluir usuário:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao excluir.",
      error: error.message,
    });
  }
});

//  Rotas CONTA BANCÁRIA
// Create bank account
app.post("/bankAccounts", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { initialBalance } = req.body;

    const newAccountData = {
      associatedUser: userId,
      balance: parseFloat(initialBalance) || 5000,
      createdAt: new Date(),
    };

    const docRef = await database
        .collection("bankAccounts")
        .add(newAccountData);

    return res.status(201).send({
      message: "Conta bancária criada com sucesso!",
      id: docRef.id,
      accountId: newAccountData.accountId,
    });
  } catch (error) {
    console.error("Erro ao criar conta bancária:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao criar conta bancária.",
      error: error.message,
    });
  }
});

// Read all bank accounts
app.get("/bankAccounts", authenticate, async (req, res) => {
  try {
    const query = database
        .collection("bankAccounts")
        .orderBy("createdAt", "asc");
    const querySnapshot = await query.get();

    const bankAccounts = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).send(bankAccounts);
  } catch (error) {
    console.error("Erro ao listar contas bancárias:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar contas bancárias.",
      error: error.message,
    });
  }
});

// Read bank account by ID
app.get("/bankAccount/user", authenticate, async (req, res) => {
  try {
    // O userId é extraído do token pelo seu middleware 'authenticate'
    const userId = req.user.user_id;
    console.log("Buscando conta para o usuário:", userId);

    // eslint-disable-next-line max-len
    // Realiza uma query para encontrar o documento onde o 'associatedUser' é igual ao userId do token
    const bankAccountsRef = database.collection("bankAccounts");
    const snapshot = await bankAccountsRef
        .where("associatedUser", "==", userId)
        .get();

    if (snapshot.empty) {
      return res.status(404).send({
        message: "Nenhuma conta bancária encontrada para este usuário.",
      });
    }

    // Como usamos .limit(1), pegamos o primeiro documento retornado
    const doc = snapshot.docs[1];
    const accountData = { id: doc.id, ...doc.data() };

    // Retorna os dados da conta
    return res.status(200).send(accountData);
  } catch (error) {
    console.error("Erro ao buscar conta bancária por userId:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar conta bancária.",
      error: error.message,
    });
  }
});

//  Rotas TRANSACTIONS
// Create transaction (Transferência)
app.post("/transactions", authenticate, async (req, res) => {
  const userId = req.user.user_id;
  const { fromAccountId, toAccountId, amount, category } = req.body;
  let fileUrl;
  let fileName;

  if (!fromAccountId || !toAccountId || !amount || amount <= 0) {
    return res
        .status(400)
        .send({ message: "Dados de transação inválidos ou incompletos." });
  }

  const fromAccountRef = database.collection("bankAccounts").doc(fromAccountId);
  const toAccountRef = database.collection("bankAccounts").doc(toAccountId);
  // content-type': 'multipart/form-data
  try {
    // if (req.headers["content-type"] === "multipart/form-data") {
    //   const response = await fetch(
    //     "http://127.0.0.1:5001/api-prime-bank/us-central1/uploadFile",
    //     {
    //       method: "POST",
    //     }
    //   );

    //   console.log({ response });
    // }

    const transactionRefs = await database.runTransaction(
        async (transaction) => {
          const fromDoc = await transaction.get(fromAccountRef);
          const toDoc = await transaction.get(toAccountRef);

          if (!fromDoc.exists || !toDoc.exists) {
            throw new Error("Uma das contas bancárias não foi encontrada.");
          }

          if (fromDoc.data().associatedUser !== userId) {
            throw new Error(
                "Permissão negada. Você não é o dono da conta de origem."
            );
          }

          const currentBalance = fromDoc.data().balance || 0;
          const transferAmount = parseFloat(amount);

          if (currentBalance < transferAmount) {
            throw new Error("Saldo insuficiente para realizar a transação.");
          }

          const newFromBalance = currentBalance - transferAmount;
          const newToBalance = (toDoc.data().balance || 0) + transferAmount;

          transaction.update(fromAccountRef, { balance: newFromBalance });
          transaction.update(toAccountRef, { balance: newToBalance });

          const senderUID = fromDoc.data().associatedUser;
          const receiverUID = toDoc.data().associatedUser;
          const dateString = new Date();
          const baseTransactionRef = database.collection("transactions").doc();

          const senderTransactionData = {
            fromAccountId: fromAccountId,
            toAccountId: toAccountId,
            amount: transferAmount,
            date: dateString,
            fileName: fileName || null,
            fileUrl: fileUrl || null,
            associatedUser: senderUID,
            type: "sended",
            createdAt: dateString,
            name: fromDoc.data().name,
            category: category,
          };

          transaction.set(baseTransactionRef, senderTransactionData);

          const receiverTransactionData = {
            fromAccountId: fromAccountId,
            toAccountId: toAccountId,
            amount: transferAmount,
            date: dateString,
            fileName: fileName || null,
            fileUrl: fileUrl || null,
            associatedUser: receiverUID,
            type: "received",
            createdAt: dateString,
            name: toDoc.data().name,
            category: category,
          };

          const receiverTransactionRef = database
              .collection("transactions")
              .doc();
          transaction.set(receiverTransactionRef, receiverTransactionData);

          return {
            senderId: baseTransactionRef.id,
            receiverId: receiverTransactionRef.id,
          };
        }
    );

    return res.status(201).send({
      message:
        "Transação (transferência) realizada e saldos atualizados com sucesso.",
      senderId: transactionRefs.senderId,
      receiverId: transactionRefs.receiverId,
    });
  } catch (error) {
    console.error("Erro ao executar transação:", error.message);

    if (
      error.message.includes("Saldo insuficiente") ||
      error.message.includes("Permissão negada") ||
      error.message.includes("não foi encontrada")
    ) {
      return res.status(403).send({ message: error.message });
    }

    return res.status(500).send({
      message: "Erro interno do servidor ao processar a transação.",
      error: error.message,
    });
  }
});

// Read all transactions with filters and pagination
app.get("/transactions", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;
    const { minAmount, maxAmount, month, itemsPerPage, lastItemId } = req.query;

    const minAmountValue = minAmount ? parseFloat(minAmount) : null;
    const maxAmountValue = maxAmount ? parseFloat(maxAmount) : null;
    const pageSize = parseInt(itemsPerPage, 10) || 100;

    let query = database
        .collection("transactions")
        .where("associatedUser", "==", userId)
        .orderBy("date", "desc");

    // 1. Aplicação dos Filtros de Quantidade
    if (minAmountValue !== null) {
      query = query.where("amount", ">=", minAmountValue);
    }
    if (maxAmountValue !== null) {
      query = query.where("amount", "<=", maxAmountValue);
    }

    // 2. Aplicação do Filtro por Mês
    if (month) {
      const [monthStr, yearStr] = month.split("-");
      const monthNum = parseInt(monthStr, 10);
      let yearNum = parseInt(yearStr, 10);

      if (yearNum < 100) {
        yearNum += 2000;
      }

      if (monthNum >= 1 && monthNum <= 12 && yearNum) {
        const start = new Date(yearNum, monthNum - 1, 1);
        const end = new Date(yearNum, monthNum, 1);

        const startTimestamp = admin.firestore.Timestamp.fromDate(start);
        const endTimestamp = admin.firestore.Timestamp.fromDate(end);

        query = query.where("date", ">=", startTimestamp);
        query = query.where("date", "<", endTimestamp);
      }
    }

    // 3. Paginação
    if (lastItemId) {
      const cursorDoc = await database
          .collection("transactions")
          .doc(lastItemId)
          .get();

      if (cursorDoc.exists) {
        query = query.startAfter(cursorDoc);
      }
    }

    query = query.limit(pageSize);

    // 4. Execução
    const querySnapshot = await query.get();

    const transactions = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // 5. Retorno da Paginação
    const lastDoc = querySnapshot.docs[querySnapshot.docs.length - 1];
    const nextCursorId = lastDoc ? lastDoc.id : null;
    const hasMore = querySnapshot.docs.length === pageSize;

    return res.status(200).send({
      data: transactions,
      pagination: {
        itemsPerPage: pageSize,
        nextCursorId: nextCursorId,
        hasMore: hasMore,
      },
    });
  } catch (error) {
    console.error("Erro ao listar transações:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar transações.",
      error: error.message,
    });
  }
});

// Read transaction by ID
app.get("/transactions/:id", authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("transactions").doc(transactionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Transação não encontrada." });
    }

    const transactionData = { id: doc.id, ...doc.data() };

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (transactionData.associatedUser !== userId) {
      return res.status(403).send({
        message: "Acesso negado. Esta transação não pertence ao seu usuário.",
      });
    }

    return res.status(200).send(transactionData);
  } catch (error) {
    console.error("Erro ao buscar transação:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar transação.",
      error: error.message,
    });
  }
});

// Update transaction
app.put("/transactions/:id", authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.user_id;
    const updateData = req.body;

    const docRef = database.collection("transactions").doc(transactionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Transação não encontrada." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode atualizar suas próprias transações.",
      });
    }

    delete updateData.associatedUser;

    await docRef.update(updateData);

    return res.status(200).send({
      message: `Transação com ID ${transactionId} atualizada com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar transação:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao atualizar transação.",
      error: error.message,
    });
  }
});

// Delete transaction
app.delete("/transactions/:id", authenticate, async (req, res) => {
  try {
    const transactionId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("transactions").doc(transactionId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Transação não encontrada." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode excluir suas próprias transações.",
      });
    }

    await docRef.delete();

    return res.status(200).send({
      message: `Transação com ID ${transactionId} excluída com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao excluir transação:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao excluir transação.",
      error: error.message,
    });
  }
});

// Read all investments
app.get("/investments", authenticate, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const query = database
        .collection("investments")
        .where("associatedUser", "==", userId)
        .orderBy("createdAt", "desc");

    const querySnapshot = await query.get();

    const investments = querySnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    return res.status(200).send(investments);
  } catch (error) {
    console.error("Erro ao listar investimentos:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao listar investimentos.",
      error: error.message,
    });
  }
});

// Read investment by ID
app.get("/investments/:id", authenticate, async (req, res) => {
  try {
    const investmentId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("investments").doc(investmentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Investimento não encontrado." });
    }

    const investmentData = { id: doc.id, ...doc.data() };

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (investmentData.associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Este investimento não pertence ao seu usuário.",
      });
    }

    return res.status(200).send(investmentData);
  } catch (error) {
    console.error("Erro ao buscar investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar investimento.",
      error: error.message,
    });
  }
});

// Update investment
app.put("/investments/:id", authenticate, async (req, res) => {
  try {
    const investmentId = req.params.id;
    const userId = req.user.user_id;
    const updateData = req.body;

    const docRef = database.collection("investments").doc(investmentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Investimento não encontrado." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode atualizar seus próprios investimentos.",
      });
    }

    delete updateData.associatedUser;

    await docRef.update(updateData);

    return res.status(200).send({
      message: `Investimento com ID ${investmentId} atualizado com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao atualizar investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao atualizar investimento.",
      error: error.message,
    });
  }
});

// Delete investment
app.delete("/investments/:id", authenticate, async (req, res) => {
  try {
    const investmentId = req.params.id;
    const userId = req.user.user_id;

    const docRef = database.collection("investments").doc(investmentId);
    const doc = await docRef.get();

    if (!doc.exists) {
      return res.status(404).send({ message: "Investimento não encontrado." });
    }

    // ⭐️ VERIFICAÇÃO DE PROPRIEDADE
    if (doc.data().associatedUser !== userId) {
      return res.status(403).send({
        message:
          "Acesso negado. Você só pode excluir seus próprios investimentos.",
      });
    }

    await docRef.delete();

    return res.status(200).send({
      message: `Investimento com ID ${investmentId} excluído com sucesso.`,
    });
  } catch (error) {
    console.error("Erro ao excluir investimento:", error);
    return res.status(500).send({
      message: "Erro interno do servidor ao excluir investimento.",
      error: error.message,
    });
  }
});

/* =========================================================================
 * 🖼️ ROTA DE UPLOAD (CONVERTIDA PARA EXPRESS)
 * ========================================================================= */

app.post("/upload", authenticate, (req, res) => {
  const bb = busboy({ headers: req.headers });
  const userId = req.user.uid;
  let uploadData = null;

  bb.on("file", (name, file, info) => {
    const { filename, mimeType } = info;
    const uniqueFileName = `${Date.now()}-${filename}`;
    const filepath = path.join(os.tmpdir(), uniqueFileName);

    uploadData = { filepath, filename: uniqueFileName, mimeType };
    file.pipe(fs.createWriteStream(filepath));
  });

  bb.on("finish", async () => {
    if (!uploadData) return res.status(400).send("Nenhum arquivo enviado.");

    try {
      const destination = `files/${userId}/${uploadData.filename}`;
      const token = uuidv4();

      await bucket.upload(uploadData.filepath, {
        destination,
        metadata: {
          contentType: uploadData.mimeType,
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      const publicUrl = `https://firebasestorage.googleapis.com/v0/b/${
        bucket.name
      }/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;

      await database.collection("users").doc(userId).update({
        fileUrl: publicUrl,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      fs.unlinkSync(uploadData.filepath);
      res.status(200).send({ url: publicUrl });
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  req.pipe(bb); // Em Node padrão, conectamos o stream da requisição ao busboy
});

/* -------------------------------------------------------------------------
 * 🏁 INICIALIZAÇÃO DO SERVIDOR
 * ------------------------------------------------------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});

const monthNames = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

app.get("/analytics", authenticate, async (req, res) => {
  // O ID do usuário é obtido do token pelo middleware 'authenticate'
  const userId = req.user.user_id;

  try {
    // 1. Buscar todas as transações do usuário
    const transactionsQuery = database
        .collection("transactions")
        .where("associatedUser", "==", userId);

    const snapshot = await transactionsQuery.get();

    // 2. Buscar o Saldo Atual (Idealmente vem da conta bancária)
    let currentBalance = 0;
    try {
      const accountsSnapshot = await database
          .collection("bankAccounts")
          .where("associatedUser", "==", userId)
          .limit(1)
          .get();
      if (!accountsSnapshot.empty) {
        currentBalance = parseFloat(
            accountsSnapshot.docs[0].data().balance || 0
        );
      }
    } catch (e) {
      console.warn(
          "Não foi possível buscar o saldo da conta principal. Usando 0.00 como fallback."
      );
    }

    // 3. Processamento e Agregação dos Dados
    const totalTransactions = snapshot.docs.length;
    let totalAmountMoved = 0;
    let sendedCount = 0;
    let receivedCount = 0;
    let sendedAmount = 0;
    let receivedAmount = 0;

    // Estrutura para agregação mensal: { "YYYY-MM": { income: number, expense: number, label: string, date: Date } }
    const monthlyData = {};

    snapshot.docs.forEach((doc) => {
      const data = doc.data();
      // Garante que o valor é um número
      const amount = parseFloat(data.amount || 0);

      // --- Lógica de KPI (original) ---
      totalAmountMoved += amount;
      if (data.type === "sended") {
        sendedCount++;
        sendedAmount += amount;
      } else if (data.type === "received") {
        receivedCount++;
        receivedAmount += amount;
      }

      // --- Lógica de Agregação Mensal (AGORA SEM NETFLOW) ---
      const transactionDate =
        data.date && data.date.toDate ? data.date.toDate() : data.date;

      if (transactionDate instanceof Date && !isNaN(transactionDate)) {
        const year = transactionDate.getFullYear();
        const monthIndex = transactionDate.getMonth(); // 0 a 11

        // Chave única (ex: "2024-09") para ordenação e agrupamento
        const monthKey = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;

        if (!monthlyData[monthKey]) {
          // Cria o objeto Date para o início do mês (dia 1, 00:00:00)
          const startOfMonth = new Date(year, monthIndex, 1);

          monthlyData[monthKey] = {
            income: 0, // Recebidos
            expense: 0, // Enviados
            // Ex: "Set 2024" (rótulo para o gráfico)
            label: `${monthNames[monthIndex]} ${year}`,
            monthStart: startOfMonth,
          };
        }

        // Agregação do valor para o mês
        if (data.type === "sended") {
          monthlyData[monthKey].expense += amount;
        } else if (data.type === "received") {
          monthlyData[monthKey].income += amount;
        }
      }
    });

    // 4. Cálculos para Gráficos e KPIs
    const totalCount = sendedCount + receivedCount;

    const sendedPercentage =
      totalCount > 0 ? ((sendedCount / totalCount) * 100).toFixed(2) : "0.00";

    const receivedPercentage =
      totalCount > 0 ? ((receivedCount / totalCount) * 100).toFixed(2) : "0.00";

    // Conversão da agregação mensal em array ordenado e formatado
    const monthlyFlowData = Object.keys(monthlyData)
        .sort() // Ordena por chave YYYY-MM
        .map((key) => ({
          label: monthlyData[key].label,
          // O campo 'total' (que era o netFlow) foi removido.
          income: parseFloat(monthlyData[key].income.toFixed(2)),
          expense: parseFloat(monthlyData[key].expense.toFixed(2)),
          // Converte para string YYYY-MM-DD
          monthStart: monthlyData[key].monthStart.toISOString().split("T")[0],
        }));

    // 5. Montagem da Resposta Final
    const analyticsData = {
      // --------------------------------------------------------
      // KPIs - Para Cards no Topo (como nas suas imagens)
      // --------------------------------------------------------
      kpis: {
        totalTransactions: totalTransactions,
        // O valor que o usuário movimentou (enviado + recebido)
        totalAmountMoved: totalAmountMoved,
        receivedAmount: receivedAmount, // Receitas
        sendedAmount: sendedAmount, // Despesas (saídas)
        currentBalance: currentBalance, // Saldo Atual
      },

      // --------------------------------------------------------
      // Dados para Gráficos
      // --------------------------------------------------------
      charts: {
        // Gráfico de Barras: Receitas vs Despesas (Volume)
        revenueVsExpenses: [
          { name: "Receitas", value: receivedAmount, color: "#43A047" }, // verde
          { name: "Despesas", value: sendedAmount, color: "#E53935" }, // vermelho
        ],

        // Gráfico de Pizza: Distribuição por Tipo (Contagem)
        distributionByType: [
          {
            name: "Recebidas",
            count: receivedCount,
            percentage: parseFloat(receivedPercentage),
            color: "#1E88E5",
          }, // azul
          {
            name: "Transferidas",
            count: sendedCount,
            percentage: parseFloat(sendedPercentage),
            color: "#FFB300",
          }, // amarelo
        ],

        // Dados para Gráfico de Fluxo Mensal (AGORA SÓ COM ENTRADA E SAÍDA)
        // Estrutura: { label: string, income: number, expense: number, monthStart: string }
        monthlyFlowData: monthlyFlowData,

        // Dados brutos de contagem/porcentagem
        distributionDetails: {
          sended: { count: sendedCount, percentage: `${sendedPercentage}%` },
          received: {
            count: receivedCount,
            percentage: `${receivedPercentage}%`,
          },
        },
      },
    };

    return res.status(200).send(analyticsData);
  } catch (error) {
    console.error("Erro ao buscar dados de analytics:", error.message);
    return res.status(500).send({
      message: "Erro interno do servidor ao buscar dados de análise da conta.",
      error: error.message,
    });
  }
});
