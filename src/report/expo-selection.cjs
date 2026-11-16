const START_DATE = '2026-11-01';
const LEAD_STAGES = ['Նոր լիդ', 'Չեն պատասխանում', 'Հաճախորդը հետաքրքրված է', 'Տեղափոխել վաճառքի բաժին', 'Հաջող լիդ'];
const DEAL_STAGES = ['Նոր գործարք', 'Կայքից ամրագրում', 'Տեղեկանք', 'Ամրագրված', 'Վաճառված', 'Կնքված.', 'Կնքված'];
function selectExpoRows(rows, entity) {
  const stages = entity === 'lead' ? LEAD_STAGES : DEAL_STAGES;
  return rows.filter(row => row.date >= START_DATE && stages.includes(row.stageName?.trim()));
}
module.exports = { START_DATE, LEAD_STAGES, DEAL_STAGES, selectExpoRows };
