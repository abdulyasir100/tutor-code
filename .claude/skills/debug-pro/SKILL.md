---
name: debug-pro
description: Systematic 7-step debugging methodology with language-specific debugging commands for JavaScript/TypeScript, Python, Swift, CSS, network, and git bisect. Includes common error pattern reference and quick diagnostic commands.
---

# debug-pro

Systematic debugging methodology and language-specific debugging commands.

## The 7-Step Debugging Protocol

1. **Reproduce** - Get it to fail consistently. Document exact steps, inputs, and environment.
2. **Isolate** - Narrow scope. Comment out code, use binary search, check recent commits with `git bisect`.
3. **Hypothesize** - Form a specific, testable theory about the root cause.
4. **Instrument** - Add targeted logging, breakpoints, or assertions.
5. **Verify** - Confirm root cause. If hypothesis was wrong, return to step 3.
6. **Fix** - Apply the minimal correct fix. Resist the urge to refactor while debugging.
7. **Regression Test** - Write a test that catches this bug. Verify it passes.

## Language-Specific Debugging

### JavaScript / TypeScript
```bash
node --inspect-brk app.js          # Node.js debugger
# Chrome DevTools: chrome://inspect
console.log(JSON.stringify(obj, null, 2))
console.trace('Call stack here')
console.time('perf'); /* code */ console.timeEnd('perf')
node --expose-gc --max-old-space-size=4096 app.js  # Memory leaks
```

### Python
```bash
python -m pdb script.py            # Built-in debugger
breakpoint()                       # Python 3.7+
python -X tracemalloc script.py    # Verbose tracing
python -m cProfile -s cumulative script.py  # Profile
```

### Swift
```bash
lldb ./MyApp
(lldb) breakpoint set --name main
(lldb) run
(lldb) po myVariable
# Xcode: Product > Profile (Instruments)
```

### CSS / Layout
```css
* { outline: 1px solid red !important; }
.debug { background: rgba(255,0,0,0.1) !important; }
```

### Network
```bash
curl -v https://api.example.com/endpoint
dig example.com
nslookup example.com
lsof -i :3000
netstat -tlnp
```

### Git Bisect
```bash
git bisect start
git bisect bad              # Current commit is broken
git bisect good abc1234     # Known good commit
# Test middle commit, then: git bisect good / git bisect bad
# Repeat until root cause found
git bisect reset
```

## Common Error Patterns

| Error | Likely Cause | Fix |
|-------|-------------|-----|
| `Cannot read property of undefined` | Missing null check | Add optional chaining (`?.`) or validate data |
| `ENOENT` | File/directory doesn't exist | Check path, create directory |
| `CORS error` | Backend missing CORS headers | Add CORS middleware |
| `Module not found` | Missing dependency or wrong path | `npm install`, check tsconfig paths |
| `Hydration mismatch` (React) | Server/client render different HTML | Use `useEffect` for client-only |
| `Segmentation fault` | Memory corruption, null pointer | Check array bounds, pointer validity |
| `Connection refused` | Service not running | Check if service is up, verify port/host |
| `Permission denied` | File/network permission issue | Check chmod, firewall, sudo |

## Quick Diagnostic Commands

```bash
lsof -i :PORT              # What's using this port?
ps aux | grep PROCESS       # What's this process doing?
fswatch -r ./src            # Watch file changes
df -h                       # Disk space
top -l 1 | head -10         # System resource usage
```
