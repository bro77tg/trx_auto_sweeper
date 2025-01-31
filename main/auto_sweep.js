const TronWeb = require('tronweb').TronWeb;

// Настройка TronWeb
const tronWeb = new TronWeb({
  fullHost: 'https://api.trongrid.io', // Используем официальный API
  privateKey: 'your-private-key-0' // Приватный ключ для подписи
});

// Приватные ключи мультиподписных владельцев
const multisigPrivateKeys = [
  //'your-private-key-1', // Приватный ключ владельца 1
  'your-private-key-2' // Приватный ключ владельца 2
  //'your-private-key-3'  // Приватный ключ владельца 3
];

// Адреса
const sourceAddress = tronWeb.address.fromPrivateKey(tronWeb.defaultPrivateKey); // Мультиподписной адрес
const destinationAddress = 'TPE9tTHZrg7jM8g5tms7cvMWrc7bn27VSX'; // Адрес назначения
const FEE_RESERVE_TRX = 1; // Резерв TRX для комиссий
const requiredSignatures = 1; // Необходимое количество подписей

// Получение баланса
async function getBalance(address) {
  try {
    const balanceInSun = await tronWeb.trx.getBalance(address);
    return balanceInSun / 1_000_000; // Конвертируем в TRX
  } catch (error) {
    console.error('Error retrieving balance:', error);
    throw error;
  }
}

// Проверка энергии
async function checkEnergy(address) {
  try {
    const accountResources = await tronWeb.trx.getAccountResources(address);
    return accountResources.EnergyLimit - accountResources.EnergyUsed;
  } catch (error) {
    console.error('Error checking energy:', error);
    throw error;
  }
}

// Отправка мультиподписной транзакции
async function sendMultisigTransaction(from, to, amountInTRX) {
  try {
    const amountInSun = amountInTRX * 1_000_000; // Конвертируем в SUN
    const transaction = await tronWeb.transactionBuilder.sendTrx(to, amountInSun, from);

    // Подписываем транзакцию каждым из приватных ключей
    let signedTransaction = transaction;
    for (const privateKey of multisigPrivateKeys.slice(0, requiredSignatures)) {
      signedTransaction = await tronWeb.trx.multiSign(signedTransaction, privateKey);
    }

    // Отправляем транзакцию
    const result = await tronWeb.trx.sendRawTransaction(signedTransaction);
    if (result.result) {
      console.log(`Transaction successfully broadcasted. TXID: ${result.txid}`);
      return result;
    } else {
      throw new Error('Failed to broadcast the transaction.');
    }
  } catch (error) {
    console.error('Error sending transaction:', error);
    throw error;
  }
}

// Ожидание подтверждения транзакции
async function waitForConfirmation(txID) {
  let confirmed = false;
  let retries = 0;
  const maxRetries = 10;

  while (!confirmed && retries < maxRetries) {
    try {
      const tx = await tronWeb.trx.getTransaction(txID);
      if (tx && tx.ret && tx.ret[0] && tx.ret[0].contractRet === 'SUCCESS') {
        confirmed = true;
        console.log(`Transaction confirmed: ${txID}`);
      } else {
        throw new Error('Transaction not yet confirmed.');
      }
    } catch (error) {
      retries++;
      console.log(`Waiting for confirmation (${retries}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  if (!confirmed) {
    throw new Error(`Failed to confirm transaction after ${maxRetries} retries.`);
  }
}

// Автоматическая отправка TRX
async function autoSweep() {
  try {
    while (true) { // Бесконечный цикл для постоянной проверки баланса
      const currentBalance = await getBalance(sourceAddress);

      if (currentBalance > FEE_RESERVE_TRX) {
        const energyAvailable = await checkEnergy(sourceAddress);
        if (energyAvailable < 0) {
          console.log('Warning: Low energy. Transaction fees will be paid with TRX.');
        }

        const transferAmount = currentBalance - FEE_RESERVE_TRX;
        console.log(`Current balance: ${currentBalance.toFixed(6)} TRX. Sending ${transferAmount.toFixed(6)} TRX.`);
        const result = await sendMultisigTransaction(sourceAddress, destinationAddress, transferAmount);

        const txID = result.txid;
        if (txID) {
          await waitForConfirmation(txID); // Ждём подтверждения транзакции
        }
        // Пауза 30 секунд после успешной отправки
        console.log('Waiting 90 seconds before next check...');
        await new Promise(resolve => setTimeout(resolve, 90000));
      } else {
        // Пауза 5 секунд, если баланс меньше или равен резерву
        console.log(`Current balance: ${currentBalance.toFixed(6)} TRX. No action taken (balance ≤ reserve of ${FEE_RESERVE_TRX} TRX).`);
        console.log('Waiting 5 seconds before next check...');
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }
  } catch (error) {
    console.error('Auto-sweep error:', error);
  }
}

// Запуск автоматической отправки
autoSweep();
