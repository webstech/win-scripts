// Return the last instance of this object.  It is the most recent.
// If the order changes, will need to find the one with the latest
// reportDate.

export default function getquote(symbol, data) {
    const dataSet = data.performanceTimeseries;
    // const assets = dataSet.filter(el => el.performanceType === "bidPrice" &&
    //    el.underlyingReference === "asset" );
    const el = dataSet.findLast(el => el.performanceType === "bidPrice" &&
        el.underlyingReference === "asset" );
    // console.log(el);
    return el.value;
}