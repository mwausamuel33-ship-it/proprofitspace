import './even-odd-bars.scss';

type TEvenOddBarsProps = {
    even_percentage: number;
    odd_percentage: number;
};

const EvenOddBars = ({ even_percentage, odd_percentage }: TEvenOddBarsProps) => {
    return (
        <div className='even-odd-bars'>
            <div className='even-odd-bars__bar even-odd-bars__bar--even' style={{ flexGrow: even_percentage || 1 }}>
                <span className='even-odd-bars__label'>Even</span>
                <span className='even-odd-bars__value'>{even_percentage.toFixed(2)}%</span>
            </div>
            <div className='even-odd-bars__bar even-odd-bars__bar--odd' style={{ flexGrow: odd_percentage || 1 }}>
                <span className='even-odd-bars__label'>Odd</span>
                <span className='even-odd-bars__value'>{odd_percentage.toFixed(2)}%</span>
            </div>
        </div>
    );
};

export default EvenOddBars;
