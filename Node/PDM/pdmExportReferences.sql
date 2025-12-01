-- SolidWorks PDM Pro: Extract Assembly-to-Part References
-- Run this query against your PDM Pro SQL Server database
-- Export results to CSV for use with categorizeFiles.js

-- Query 1: Assembly-Part References with Part Numbers
-- This extracts parent-child relationships from the XRefs table
SELECT
    parent.Filename AS AssemblyFile,
    parent_pn.ValueText AS AssemblyPN,
    child.Filename AS ChildFile,
    child_pn.ValueText AS ChildPN,
    COUNT(*) AS Quantity
FROM XRefs x
INNER JOIN Documents parent ON x.DocumentID = parent.DocumentID
INNER JOIN Documents child ON x.XRefDocument = child.DocumentID
-- Join to get Part Number for parent (assembly)
LEFT JOIN VariableValue parent_pn ON parent.DocumentID = parent_pn.DocumentID
    AND parent_pn.VariableID = (SELECT VariableID FROM Variable WHERE VariableName = 'Number')
-- Join to get Part Number for child (part/subassembly)
LEFT JOIN VariableValue child_pn ON child.DocumentID = child_pn.DocumentID
    AND child_pn.VariableID = (SELECT VariableID FROM Variable WHERE VariableName = 'Number')
WHERE
    -- Filter to only assembly files as parents
    parent.Filename LIKE '%.SLDASM'
    -- Exclude deleted/archived files
    AND parent.Deleted = 0
    AND child.Deleted = 0
GROUP BY
    parent.Filename,
    parent_pn.ValueText,
    child.Filename,
    child_pn.ValueText
ORDER BY
    parent.Filename,
    child.Filename;

-- Query 2: All Documents with Metadata (for categorization)
-- Run this separately and export to documents.csv
/*
SELECT
    d.DocumentID,
    d.Filename,
    d.LatestRevisionNo,
    pn.ValueText AS PartNumber,
    descr.ValueText AS Description,
    rev.ValueText AS Revision,
    CASE
        WHEN d.Filename LIKE '%.SLDPRT' THEN 'PART'
        WHEN d.Filename LIKE '%.SLDASM' THEN 'ASSEMBLY'
        WHEN d.Filename LIKE '%.SLDDRW' THEN 'DRAWING'
        ELSE 'OTHER'
    END AS FileType,
    p.Path AS FolderPath
FROM Documents d
LEFT JOIN Projects p ON d.ProjectID = p.ProjectID
LEFT JOIN VariableValue pn ON d.DocumentID = pn.DocumentID
    AND pn.VariableID = (SELECT VariableID FROM Variable WHERE VariableName = 'Number')
LEFT JOIN VariableValue descr ON d.DocumentID = descr.DocumentID
    AND descr.VariableID = (SELECT VariableID FROM Variable WHERE VariableName = 'Description')
LEFT JOIN VariableValue rev ON d.DocumentID = rev.DocumentID
    AND rev.VariableID = (SELECT VariableID FROM Variable WHERE VariableName = 'Revision')
WHERE
    d.Deleted = 0
    AND (d.Filename LIKE '%.SLDPRT'
         OR d.Filename LIKE '%.SLDASM'
         OR d.Filename LIKE '%.SLDDRW')
ORDER BY d.Filename;
*/

-- Query 3: Find your Variable IDs (run this first to verify variable names)
/*
SELECT VariableID, VariableName
FROM Variable
WHERE VariableName IN ('Number', 'Description', 'Revision', 'PartNumber', 'Part Number')
ORDER BY VariableName;
*/

-- Notes:
-- 1. Variable names may differ in your PDM vault. Common alternatives:
--    - 'Number' vs 'PartNumber' vs 'Part Number'
--    - 'Description' vs 'Desc'
--    - 'Revision' vs 'Rev'
-- 2. Run Query 3 first to find the correct VariableID values
-- 3. The XRefs table stores the actual assembly-component relationships
-- 4. VariableValue stores all card variable values (Part Number, Description, etc.)
