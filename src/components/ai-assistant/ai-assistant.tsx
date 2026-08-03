import { useState, useRef, useEffect } from 'react';
import classNames from 'classnames';
import { useStore } from '@/hooks/useStore';
import { useApiBase } from '@/hooks/useApiBase';
import './ai-assistant.scss';

type TMessage = {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: number;
};

type TQuickQuestion = {
    label: string;
    question: string;
};

const QUICK_QUESTIONS: TQuickQuestion[] = [
    { label: 'Safest Market Now', question: 'Which market is safest now?' },
    { label: 'Should I Trade?', question: 'Should I trade Over 6?' },
    { label: 'Why This Signal?', question: 'Why are you recommending Even?' },
    { label: 'What Changed?', question: 'What changed after the last trade?' },
    { label: 'Highest Confidence', question: 'Which market has the highest confidence?' },
];

const AIAssistant = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState<TMessage[]>([
        {
            id: 'welcome',
            role: 'assistant',
            content: 'Hello! I\'m your ProProfitSpace AI assistant. I can analyze current market conditions, explain signals, and help you make informed trading decisions. What would you like to know?',
            timestamp: Date.now(),
        },
    ]);
    const [input, setInput] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const { client } = useStore();
    const { connectionStatus } = useApiBase();

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const generateResponse = (question: string): string => {
        const q = question.toLowerCase();

        if (q.includes('safest') || q.includes('safe market')) {
            return 'Based on current market analysis, I recommend checking the Signal Scanner tab for real-time safety ratings. Markets with low volatility and high entropy stability are generally safer. Look for "Excellent" or "Good" market health ratings in the Live Market Scanner.';
        }
        if (q.includes('should i trade') || q.includes('trade over') || q.includes('trade under')) {
            return 'Before trading, check the AI Signal Center for your selected market. I analyze digit frequency, entropy, volatility, and momentum to provide confidence scores. Only trade when confidence is above 70% and market health is stable.';
        }
        if (q.includes('why') || q.includes('recommend')) {
            return 'My recommendations are based on statistical deviation from fair-market baselines. I analyze: (1) Digit frequency distribution, (2) Shannon entropy to measure randomness, (3) Volatility coefficients, (4) Momentum trends, (5) Pattern repetition across time windows. Each signal includes a detailed AI explanation in the Signal Center.';
        }
        if (q.includes('changed') || q.includes('last trade') || q.includes('after')) {
            return 'After each trade, I re-analyze the market with fresh tick data. The Smart Recovery system can: continue with the same signal if confidence increased, modify the prediction if conditions shifted, reverse direction if the market shows opposite bias, or cancel further trades if confidence dropped below threshold. Maximum 3 recovery analyses per opportunity.';
        }
        if (q.includes('highest confidence') || q.includes('best market') || q.includes('strongest')) {
            return 'Check the Live Market Scanner (Signal Scanner tab) — it continuously ranks all Volatility and Jump indices by opportunity strength. The market at the top of the list has the highest combined confidence score based on current digit analysis, entropy levels, and volatility stability.';
        }
        if (q.includes('over/under') || q.includes('even/odd') || q.includes('signal type')) {
            return 'I support four signal types: Over/Under (predict if last digit is above/below a barrier), Even/Odd (predict parity), Matches/Differs (predict exact digit), and Rise/Fall (price direction). Each type uses different statistical models optimized for that contract category.';
        }
        if (q.includes('balance') || q.includes('stake') || q.includes('money')) {
            return `Your current balance is ${client?.balance || '—'} ${client?.currency || ''}. I recommend conservative stake sizing based on risk level: 2.5% for low risk, 1.5% for medium risk, 0.8% for high risk, and 0.3% for extreme risk. Never risk more than you can afford to lose.`;
        }

        return 'I can help you with market analysis, signal explanations, trading recommendations, and risk assessment. Try asking about specific markets, signal types, or use the quick questions above for common queries.';
    };

    const handleSend = () => {
        if (!input.trim()) return;

        const userMessage: TMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: input.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsTyping(true);

        // Simulate AI thinking delay
        setTimeout(() => {
            const assistantMessage: TMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: generateResponse(userMessage.content),
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMessage]);
            setIsTyping(false);
        }, 800 + Math.random() * 700);
    };

    const handleQuickQuestion = (question: string) => {
        const userMessage: TMessage = {
            id: `user-${Date.now()}`,
            role: 'user',
            content: question,
            timestamp: Date.now(),
        };
        setMessages(prev => [...prev, userMessage]);
        setIsTyping(true);

        setTimeout(() => {
            const assistantMessage: TMessage = {
                id: `assistant-${Date.now()}`,
                role: 'assistant',
                content: generateResponse(question),
                timestamp: Date.now(),
            };
            setMessages(prev => [...prev, assistantMessage]);
            setIsTyping(false);
        }, 800 + Math.random() * 700);
    };

    return (
        <>
            {/* Floating Toggle Button */}
            <button
                className={classNames('pps-ai-assistant__toggle', {
                    'pps-ai-assistant__toggle--open': isOpen,
                })}
                onClick={() => setIsOpen(!isOpen)}
            >
                {isOpen ? '✕' : '🤖'}
            </button>

            {/* Chat Panel */}
            {isOpen && (
                <div className='pps-ai-assistant pps-ai-assistant--open glass'>
                    <div className='pps-ai-assistant__header'>
                        <div className='pps-ai-assistant__header-info'>
                            <span className='pps-ai-assistant__avatar'>🤖</span>
                            <div>
                                <h3 className='pps-ai-assistant__name'>ProProfitSpace AI</h3>
                                <span className='pps-ai-assistant__status'>
                                    {connectionStatus === 'opened' ? '● Connected' : '○ Offline'}
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className='pps-ai-assistant__messages'>
                        {messages.map(msg => (
                            <div
                                key={msg.id}
                                className={classNames('pps-ai-assistant__message', {
                                    'pps-ai-assistant__message--user': msg.role === 'user',
                                    'pps-ai-assistant__message--assistant': msg.role === 'assistant',
                                })}
                            >
                                <div className='pps-ai-assistant__bubble'>
                                    <p>{msg.content}</p>
                                </div>
                            </div>
                        ))}
                        {isTyping && (
                            <div className='pps-ai-assistant__message pps-ai-assistant__message--assistant'>
                                <div className='pps-ai-assistant__bubble'>
                                    <div className='pps-ai-assistant__typing'>
                                        <span></span><span></span><span></span>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className='pps-ai-assistant__quick'>
                        {QUICK_QUESTIONS.map(q => (
                            <button
                                key={q.question}
                                className='pps-ai-assistant__quick-btn'
                                onClick={() => handleQuickQuestion(q.question)}
                            >
                                {q.label}
                            </button>
                        ))}
                    </div>

                    <div className='pps-ai-assistant__input-group'>
                        <input
                            className='pps-ai-assistant__input'
                            type='text'
                            placeholder='Ask about markets, signals, or strategy...'
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && handleSend()}
                        />
                        <button
                            className='pps-ai-assistant__send'
                            onClick={handleSend}
                            disabled={!input.trim()}
                        >
                            →
                        </button>
                    </div>
                </div>
            )}
        </>
    );
};

export default AIAssistant;
