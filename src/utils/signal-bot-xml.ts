import strategyXml from '@/xml/signal_martingale.xml';

type TSignal = {
    symbol: string;
    display_name: string;
    contract_type: 'DIGITOVER' | 'DIGITUNDER' | 'DIGITEVEN' | 'DIGITODD';
    barrier: number | null;
    confidence: number;
};

export const generateSignalBotXml = (signal: TSignal): string => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(strategyXml, 'application/xml');

    const symbolField = xmlDoc.querySelector('field[name="SYMBOL_LIST"]');
    if (symbolField) {
        symbolField.textContent = signal.symbol;
    }

    const tradeTypeCatField = xmlDoc.querySelector('field[name="TRADETYPECAT_LIST"]');
    if (tradeTypeCatField) {
        tradeTypeCatField.textContent = 'digits';
    }

    const tradeTypeField = xmlDoc.querySelector('field[name="TRADETYPE_LIST"]');
    if (tradeTypeField) {
        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            tradeTypeField.textContent = 'overunder';
        } else {
            tradeTypeField.textContent = 'evenodd';
        }
    }

    const purchaseField = xmlDoc.querySelector('field[name="PURCHASE_LIST"]');
    if (purchaseField) {
        if (signal.contract_type === 'DIGITOVER') {
            purchaseField.textContent = 'OVER';
        } else if (signal.contract_type === 'DIGITUNDER') {
            purchaseField.textContent = 'UNDER';
        } else if (signal.contract_type === 'DIGITEVEN') {
            purchaseField.textContent = 'EVEN';
        } else if (signal.contract_type === 'DIGITODD') {
            purchaseField.textContent = 'ODD';
        }
    }

    const mutation = xmlDoc.querySelector('block[type="trade_definition_tradeoptions"] > mutation');
    if (mutation) {
        if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
            mutation.setAttribute('has_prediction', 'true');
        } else {
            mutation.setAttribute('has_prediction', 'false');
        }
    }

    if (signal.contract_type === 'DIGITOVER' || signal.contract_type === 'DIGITUNDER') {
        const predictionValue = xmlDoc.querySelector('value[strategy_value="last_digit_prediction"]');
        if (predictionValue) {
            const shadow = predictionValue.querySelector('shadow');
            if (shadow) {
                const numField = shadow.querySelector('field[name="NUM"]');
                if (numField) {
                    numField.textContent = String(signal.barrier ?? 5);
                }
            }
        }
    }

    const serializer = new XMLSerializer();
    return serializer.serializeToString(xmlDoc);
};
