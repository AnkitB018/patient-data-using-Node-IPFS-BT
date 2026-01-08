/**
 * Analytics Helper
 * Statistical aggregation for database-wide medical record insights
 */

/**
 * Generate statistical summary from GA-matched records
 * @param {Array} records - Top N matched records from GA
 * @returns {Object} Statistical summary
 */
export function generateStatisticalSummary(records) {
    if (!records || records.length === 0) {
        return {
            totalAnalyzed: 0,
            confidence: 'None',
            error: 'No records to analyze'
        };
    }

    const total = records.length;
    const summary = {
        totalAnalyzed: total,
        confidence: total >= 30 ? 'High' : total >= 15 ? 'Medium' : 'Low'
    };

    // 1. Primary Diagnoses Analysis
    const diagnosisCounts = {};
    records.forEach(record => {
        const diagnosis = record.primary_diagnosis || record.disease || 'Unknown';
        diagnosisCounts[diagnosis] = (diagnosisCounts[diagnosis] || 0) + 1;
    });
    
    summary.diagnoses = Object.entries(diagnosisCounts)
        .map(([name, count]) => ({
            diagnosis: name,
            percentage: parseFloat((count / total * 100).toFixed(1)),
            count: count,
            confidence: count >= 5 ? 'reliable' : 'limited'
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);  // Top 5 diagnoses

    // 2. Common Symptoms Analysis
    const symptomCounts = {};
    records.forEach(record => {
        let symptoms = [];
        if (typeof record.symptoms === 'string') {
            symptoms = record.symptoms.split(',').map(s => s.trim()).filter(s => s.length > 0);
        } else if (Array.isArray(record.symptoms)) {
            symptoms = record.symptoms.filter(s => s && s.length > 0);
        }
        
        symptoms.forEach(symptom => {
            symptomCounts[symptom] = (symptomCounts[symptom] || 0) + 1;
        });
    });
    
    summary.commonSymptoms = Object.entries(symptomCounts)
        .map(([name, count]) => ({
            symptom: name,
            percentage: parseFloat((count / total * 100).toFixed(1)),
            frequency: count
        }))
        .sort((a, b) => b.frequency - a.frequency)
        .slice(0, 10);  // Top 10 symptoms

    // 3. Treatment Patterns Analysis
    const treatmentCounts = {};
    records.forEach(record => {
        let treatments = [];
        if (typeof record.treatments_given === 'string') {
            treatments = record.treatments_given.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } else if (Array.isArray(record.treatments_given)) {
            treatments = record.treatments_given.filter(t => t && t.length > 0);
        } else if (typeof record.treatments === 'string') {
            treatments = record.treatments.split(',').map(t => t.trim()).filter(t => t.length > 0);
        } else if (Array.isArray(record.treatments)) {
            treatments = record.treatments.filter(t => t && t.length > 0);
        }
        
        treatments.forEach(treatment => {
            treatmentCounts[treatment] = (treatmentCounts[treatment] || 0) + 1;
        });
    });
    
    summary.suggestedTreatments = Object.entries(treatmentCounts)
        .map(([name, count]) => ({
            treatment: name,
            percentage: parseFloat((count / total * 100).toFixed(1)),
            usedIn: count
        }))
        .sort((a, b) => b.usedIn - a.usedIn)
        .slice(0, 8);  // Top 8 treatments

    // 4. Medication Patterns Analysis
    const medicationCounts = {};
    records.forEach(record => {
        let medications = [];
        if (typeof record.medications === 'string') {
            medications = record.medications.split(',').map(m => m.trim()).filter(m => m.length > 0);
        } else if (Array.isArray(record.medications)) {
            medications = record.medications.filter(m => m && m.length > 0);
        }
        
        medications.forEach(medication => {
            medicationCounts[medication] = (medicationCounts[medication] || 0) + 1;
        });
    });
    
    summary.medications = Object.entries(medicationCounts)
        .map(([name, count]) => ({
            medication: name,
            percentage: parseFloat((count / total * 100).toFixed(1)),
            prescribed: count
        }))
        .sort((a, b) => b.prescribed - a.prescribed)
        .slice(0, 8);  // Top 8 medications

    // 5. Secondary Diagnoses (Co-morbidities)
    const secondaryDiagCounts = {};
    records.forEach(record => {
        let secondaryDiagnoses = [];
        if (typeof record.secondary_diagnoses === 'string') {
            secondaryDiagnoses = record.secondary_diagnoses.split(',').map(d => d.trim()).filter(d => d.length > 0);
        } else if (Array.isArray(record.secondary_diagnoses)) {
            secondaryDiagnoses = record.secondary_diagnoses.filter(d => d && d.length > 0);
        }
        
        secondaryDiagnoses.forEach(diagnosis => {
            secondaryDiagCounts[diagnosis] = (secondaryDiagCounts[diagnosis] || 0) + 1;
        });
    });
    
    summary.comorbidities = Object.entries(secondaryDiagCounts)
        .map(([name, count]) => ({
            condition: name,
            percentage: parseFloat((count / total * 100).toFixed(1)),
            occurrences: count
        }))
        .sort((a, b) => b.occurrences - a.occurrences)
        .slice(0, 5);  // Top 5 co-morbidities

    // 6. Affected Body Parts Analysis
    const bodyPartCounts = {};
    records.forEach(record => {
        let bodyParts = [];
        if (typeof record.affected_body_parts === 'string') {
            bodyParts = record.affected_body_parts.split(',').map(b => b.trim()).filter(b => b.length > 0);
        } else if (Array.isArray(record.affected_body_parts)) {
            bodyParts = record.affected_body_parts.filter(b => b && b.length > 0);
        }
        
        bodyParts.forEach(part => {
            bodyPartCounts[part] = (bodyPartCounts[part] || 0) + 1;
        });
    });
    
    summary.affectedBodyParts = Object.entries(bodyPartCounts)
        .map(([name, count]) => ({
            bodyPart: name,
            percentage: parseFloat((count / total * 100).toFixed(1)),
            affected: count
        }))
        .sort((a, b) => b.affected - a.affected)
        .slice(0, 8);

    // 7. Demographics Analysis
    const genderCounts = {};
    const bloodGroups = {};
    const fileTypes = {};
    
    records.forEach(record => {
        // Gender - only count valid, meaningful gender values
        const gender = record.gender;
        if (gender && gender !== '0' && gender !== 'null' && gender.trim() !== '' && gender.toLowerCase() !== 'unknown') {
            const normalizedGender = gender.charAt(0).toUpperCase() + gender.slice(1).toLowerCase();
            genderCounts[normalizedGender] = (genderCounts[normalizedGender] || 0) + 1;
        }
        
        // Blood Group
        if (record.blood_group && record.blood_group !== '0' && record.blood_group.trim() !== '') {
            bloodGroups[record.blood_group] = (bloodGroups[record.blood_group] || 0) + 1;
        }
        
        // File Type
        if (record.file_type) {
            fileTypes[record.file_type] = (fileTypes[record.file_type] || 0) + 1;
        }
    });
    
    summary.demographics = {
        gender: Object.entries(genderCounts)
            .filter(([_, count]) => count > 0)
            .map(([name, count]) => ({
                gender: name,
                percentage: parseFloat((count / total * 100).toFixed(1)),
                count: count
            }))
            .sort((a, b) => b.count - a.count),
        
        bloodGroups: Object.entries(bloodGroups)
            .map(([type, count]) => ({
                type,
                percentage: parseFloat((count / total * 100).toFixed(1)),
                count: count
            }))
            .sort((a, b) => b.count - a.count),
        
        recordTypes: Object.entries(fileTypes)
            .map(([type, count]) => ({
                fileType: type,
                percentage: parseFloat((count / total * 100).toFixed(1)),
                count: count
            }))
            .sort((a, b) => b.count - a.count)
    };

    // 8. Temporal patterns (if timestamps available)
    const timestamps = records
        .map(r => r.timestamp)
        .filter(t => t && !isNaN(t))
        .sort((a, b) => a - b);
    
    if (timestamps.length > 0) {
        const oldestTimestamp = timestamps[0];
        const newestTimestamp = timestamps[timestamps.length - 1];
        const timeSpanDays = Math.floor((newestTimestamp - oldestTimestamp) / (1000 * 60 * 60 * 24));
        
        summary.temporalInfo = {
            dataSpan: `${timeSpanDays} days`,
            oldestRecord: new Date(oldestTimestamp).toLocaleDateString(),
            newestRecord: new Date(newestTimestamp).toLocaleDateString(),
            recordsWithTimestamps: timestamps.length
        };
    }

    return summary;
}

/**
 * Generate clinical insights with professional medical terminology
 * @param {Object} summary - Statistical summary
 * @returns {Array} Array of insight objects with icons and smart text
 */
export function generateClinicalInsights(summary) {
    const insights = [];

    // Insight 1: Primary diagnosis with clinical context
    if (summary.diagnoses && summary.diagnoses.length > 0) {
        const topDiagnosis = summary.diagnoses[0];
        const prevalence = topDiagnosis.percentage.toFixed(1);
        let context = '';
        
        if (topDiagnosis.percentage >= 50) {
            context = 'representing a dominant clinical pattern in the matched cohort';
        } else if (topDiagnosis.percentage >= 30) {
            context = 'indicating significant prevalence among similar presentations';
        } else {
            context = 'suggesting variable diagnostic outcomes in this patient population';
        }
        
        insights.push({
            icon: 'bi-clipboard2-pulse',
            text: `<strong>Primary Diagnosis:</strong> ${topDiagnosis.diagnosis} presents in ${prevalence}% of similar cases, ${context}. This suggests a strong epidemiological correlation with the provided clinical criteria.`
        });
    }

    // Insight 2: Symptom clustering with clinical significance
    if (summary.symptoms && summary.symptoms.length >= 3) {
        const topSymptoms = summary.symptoms.slice(0, 3);
        const symptomList = topSymptoms.map(s => `${s.symptom} (${s.percentage.toFixed(0)}%)`).join(', ');
        const avgPrevalence = (topSymptoms.reduce((sum, s) => sum + s.percentage, 0) / topSymptoms.length).toFixed(0);
        
        insights.push({
            icon: 'bi-heart-pulse',
            text: `<strong>Symptom Pattern Analysis:</strong> High co-occurrence detected for ${symptomList}. Average prevalence of ${avgPrevalence}% suggests these symptoms form a characteristic clinical triad in similar presentations.`
        });
    }

    // Insight 3: Treatment recommendations with evidence strength
    if (summary.treatments && summary.treatments.length > 0) {
        const topTreatment = summary.treatments[0];
        const secondTreatment = summary.treatments[1];
        
        let treatmentText = `<strong>Treatment Protocol:</strong> ${topTreatment.treatment} is the predominant therapeutic approach (${topTreatment.percentage.toFixed(1)}% of cases)`;
        
        if (secondTreatment && topTreatment.percentage - secondTreatment.percentage < 10) {
            treatmentText += `, with ${secondTreatment.treatment} (${secondTreatment.percentage.toFixed(1)}%) as a comparable alternative. Consider both options based on patient-specific factors.`;
        } else {
            treatmentText += `. This represents the evidence-based standard of care for this clinical presentation.`;
        }
        
        insights.push({
            icon: 'bi-prescription2',
            text: treatmentText
        });
    }

    // Insight 4: Medication patterns
    if (summary.medications && summary.medications.length > 0) {
        const topMed = summary.medications[0];
        insights.push({
            icon: 'bi-capsule',
            text: `<strong>Pharmacotherapy:</strong> ${topMed.medication} is prescribed in ${topMed.percentage.toFixed(1)}% of similar cases, indicating established efficacy and physician preference for this clinical scenario.`
        });
    }

    // Insight 5: Sample size and confidence
    if (summary.totalAnalyzed < 15) {
        insights.push({
            icon: 'bi-exclamation-triangle-fill',
            text: `<strong>Statistical Note:</strong> Limited sample size (${summary.totalAnalyzed} records). These patterns should be considered preliminary and validated against larger datasets or clinical guidelines.`
        });
    } else if (summary.totalAnalyzed >= 50) {
        insights.push({
            icon: 'bi-shield-check',
            text: `<strong>High Confidence Analysis:</strong> Robust dataset of ${summary.totalAnalyzed} records provides statistically significant patterns. These findings demonstrate strong clinical evidence for decision support.`
        });
    } else if (summary.totalAnalyzed >= 30) {
        insights.push({
            icon: 'bi-graph-up-arrow',
            text: `<strong>Reliable Dataset:</strong> Analysis based on ${summary.totalAnalyzed} matched records offers good statistical confidence. Patterns observed are clinically meaningful and actionable.`
        });
    }

    // Insight 6: Demographics if available
    if (summary.demographics && summary.demographics.gender && summary.demographics.gender.length > 0) {
        const validGenders = summary.demographics.gender.filter(g => 
            g.gender && g.gender !== 'Unknown' && g.gender !== '0' && g.count > 0
        );
        
        if (validGenders.length > 0) {
            const topGender = validGenders[0];
            if (topGender.percentage >= 60) {
                const genderLabel = topGender.gender.toLowerCase() === 'male' ? 'male' : 
                                   topGender.gender.toLowerCase() === 'female' ? 'female' : 
                                   topGender.gender.toLowerCase();
                insights.push({
                    icon: 'bi-people',
                    text: `<strong>Demographic Pattern:</strong> ${topGender.percentage.toFixed(0)}% of cases occur in <strong>${genderLabel}</strong> patients, suggesting potential gender-specific epidemiological trends worth considering in diagnosis and treatment planning.`
                });
            } else if (validGenders.length >= 2) {
                insights.push({
                    icon: 'bi-people',
                    text: `<strong>Demographic Distribution:</strong> Cases are distributed across ${validGenders.map(g => `${g.gender} (${g.percentage.toFixed(0)}%)`).join(', ')}, indicating varied patient demographics in this clinical presentation.`
                });
            }
        }
    }

    return insights;
}
