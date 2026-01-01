// security-audit.js - Security audit script
const fs = require('fs');
const path = require('path');

const SECURITY_CHECKS = {
    'app.js': [
        { pattern: /eval\s*\(/, message: 'Avoid eval() - security risk' },
        { pattern: /new Function/, message: 'Avoid new Function() - security risk' },
        { pattern: /innerHTML\s*=/, message: 'Use textContent instead of innerHTML when possible' },
        { pattern: /document\.write/, message: 'Avoid document.write()' },
        { pattern: /localStorage\.setItem.*token/, message: 'Tokens should use sessionStorage, not localStorage' }
    ],
    'index.html': [
        { pattern: /unsafe-inline/, message: 'Consider removing unsafe-inline from CSP' },
        { pattern: /unsafe-eval/, message: 'Consider removing unsafe-eval from CSP' }
    ],
    'video-api-worker.js': [
        { pattern: /console\.log.*token/, message: 'Avoid logging tokens in production' },
        { pattern: /JSON\.parse.*untrusted/, message: 'Validate JSON before parsing' }
    ]
};

function auditFile(filename) {
    console.log(`\n🔍 Auditing: ${filename}`);
    
    if (!fs.existsSync(filename)) {
        console.log(`❌ File not found: ${filename}`);
        return;
    }
    
    const content = fs.readFileSync(filename, 'utf8');
    const checks = SECURITY_CHECKS[path.basename(filename)] || [];
    
    let issues = 0;
    
    checks.forEach((check, index) => {
        const matches = content.match(check.pattern);
        if (matches) {
            issues++;
            console.log(`⚠️  Issue ${index + 1}: ${check.message}`);
            console.log(`   Found at: ${matches[0].substring(0, 50)}...`);
        }
    });
    
    if (issues === 0) {
        console.log('✅ No security issues found');
    } else {
        console.log(`❌ Found ${issues} security issue(s)`);
    }
    
    return issues;
}

function runSecurityAudit() {
    console.log('🚀 Starting Security Audit for Harch Video Player\n');
    
    const files = ['app.js', 'index.html', 'video-api-worker.js'];
    let totalIssues = 0;
    
    files.forEach(file => {
        totalIssues += auditFile(file);
    });
    
    console.log('\n' + '='.repeat(50));
    console.log(`📊 Audit Complete: ${totalIssues} total issue(s) found`);
    
    if (totalIssues > 0) {
        console.log('\n🔒 Recommendations:');
        console.log('1. Review all security warnings');
        console.log('2. Implement proper input validation');
        console.log('3. Use HTTPS for all requests');
        console.log('4. Implement rate limiting');
        console.log('5. Regular security updates');
        process.exit(1);
    } else {
        console.log('✅ All security checks passed!');
        process.exit(0);
    }
}

runSecurityAudit();
