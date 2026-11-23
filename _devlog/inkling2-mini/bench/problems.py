"""Coding problems for the benchmark: (name, task given to the model, hidden test code).

The test code is appended to the model's solution and run in a subprocess. Most tests compare against a
brute-force reference on random inputs, so they do not depend on hand-written expected values.
"""

PROBLEMS = [
    ("min_window",
     "Write `min_window(s: str, t: str) -> str` returning the shortest substring of s that contains every character of t "
     "(counting duplicates). Return '' if there is none. If several have the same length, return any of them.",
     r'''
import random, collections
def _ok(w, t):
    c = collections.Counter(w)
    return all(c[k] >= v for k, v in collections.Counter(t).items())
def _brute(s, t):
    best = None
    for i in range(len(s)):
        for j in range(i + 1, len(s) + 1):
            if _ok(s[i:j], t) and (best is None or j - i < best):
                best = j - i
    return best
random.seed(0)
for _ in range(300):
    s = ''.join(random.choice('abc') for _ in range(random.randint(0, 12)))
    t = ''.join(random.choice('abc') for _ in range(random.randint(1, 4)))
    r, b = min_window(s, t), _brute(s, t)
    if b is None:
        assert r == '', (s, t, r)
    else:
        assert len(r) == b and r in s and _ok(r, t), (s, t, r)
'''),
    ("evaluate",
     "Write `evaluate(expr: str) -> int` that evaluates an arithmetic expression containing non-negative integers, the "
     "binary operators + - *, parentheses, spaces, and unary minus (which may appear before a number or a parenthesis, "
     "including directly after another operator). Use normal precedence. Do not use eval or exec.",
     r'''
import random
def _gen(d):
    if d == 0 or random.random() < 0.3:
        return str(random.randint(0, 20))
    k = random.random()
    if k < 0.2:
        return '-(' + _gen(d - 1) + ')'
    if k < 0.3:
        return '-' + str(random.randint(0, 9))
    if k < 0.45:
        return '( ' + _gen(d - 1) + ' )'
    return _gen(d - 1) + random.choice([' + ', '-', ' * ', '*', ' - ']) + _gen(d - 1)
random.seed(1)
for _ in range(400):
    e = _gen(4)
    # eval is safe here: e comes only from _gen above (digits, + - *, parentheses), never from the model
    assert evaluate(e) == eval(e), e
assert evaluate("2*-3") == -6 and evaluate(" 7 ") == 7 and evaluate("-(2+3)*4") == -20
'''),
    ("lis_length",
     "Write `lis_length(a: list[int]) -> int` returning the length of the longest strictly increasing subsequence. "
     "It must handle 100000 elements quickly (O(n log n)).",
     r'''
import random
def _ref(a):
    d = []
    for i, x in enumerate(a):
        d.append(1 + max([d[j] for j in range(i) if a[j] < x], default=0))
    return max(d, default=0)
random.seed(2)
for _ in range(300):
    a = [random.randint(-5, 15) for _ in range(random.randint(0, 25))]
    assert lis_length(a) == _ref(a), a
big = list(range(100000))
assert lis_length(big) == 100000 and lis_length(big[::-1]) == 1
'''),
    ("sort_semver",
     "Write `sort_semver(versions: list[str]) -> list[str]` that returns the versions sorted in ascending order of "
     "precedence as defined by Semantic Versioning 2.0.0, including pre-release identifiers (for example '1.0.0-rc.1').",
     r'''
import random
_order = ["0.9.9", "1.0.0-alpha", "1.0.0-alpha.1", "1.0.0-alpha.beta", "1.0.0-beta", "1.0.0-beta.2", "1.0.0-beta.11",
          "1.0.0-rc.1", "1.0.0", "1.0.1", "1.2.0-0", "1.2.0-1", "1.2.0-a", "1.2.0", "1.10.0", "2.0.0-rc.9", "2.0.0-rc.10", "2.0.0"]
random.seed(3)
for _ in range(100):
    v = _order[:]
    random.shuffle(v)
    assert sort_semver(v) == _order, sort_semver(v)
'''),
    ("topo_order",
     "Write `topo_order(n: int, edges: list[tuple[int, int]]) -> list[int]` for a directed graph with nodes 0..n-1, where "
     "an edge (a, b) means a must come before b. Return any valid ordering of all n nodes, or [] if the graph has a cycle.",
     r'''
import random
def _has_cycle(n, edges):
    indeg = [0] * n
    adj = [[] for _ in range(n)]
    for a, b in edges:
        adj[a].append(b)
        indeg[b] += 1
    q = [i for i in range(n) if indeg[i] == 0]
    seen = 0
    while q:
        x = q.pop()
        seen += 1
        for y in adj[x]:
            indeg[y] -= 1
            if indeg[y] == 0:
                q.append(y)
    return seen != n
random.seed(4)
for _ in range(300):
    n = random.randint(1, 8)
    edges = [(random.randrange(n), random.randrange(n)) for _ in range(random.randint(0, 10))]
    r = topo_order(n, edges)
    if _has_cycle(n, edges):
        assert r == [], (n, edges, r)
    else:
        assert sorted(r) == list(range(n)), (n, edges, r)
        pos = {x: i for i, x in enumerate(r)}
        assert all(pos[a] < pos[b] for a, b in edges), (n, edges, r)
'''),
    ("int_to_roman",
     "Write `int_to_roman(n: int) -> str` converting an integer from 1 to 3999 to a Roman numeral in standard "
     "subtractive notation.",
     r'''
_vals = {'I': 1, 'V': 5, 'X': 10, 'L': 50, 'C': 100, 'D': 500, 'M': 1000}
def _back(s):
    t = 0
    for i, ch in enumerate(s):
        v = _vals[ch]
        t += -v if i + 1 < len(s) and _vals[s[i + 1]] > v else v
    return t
import re
_valid = re.compile(r'^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$')
for n in range(1, 4000):
    r = int_to_roman(n)
    assert _valid.match(r) and _back(r) == n, (n, r)
assert int_to_roman(1994) == 'MCMXCIV' and int_to_roman(3888) == 'MMMDCCCLXXXVIII'
'''),
    ("trap",
     "Write `trap(heights: list[int]) -> int` returning how many units of rain water are trapped between bars of the "
     "given non-negative heights (each bar has width 1).",
     r'''
import random
def _ref(h):
    return sum(max(0, min(max(h[:i + 1]), max(h[i:])) - h[i]) for i in range(len(h)))
random.seed(5)
for _ in range(300):
    h = [random.randint(0, 6) for _ in range(random.randint(0, 15))]
    assert trap(h) == _ref(h), h
'''),
    ("next_permutation",
     "Write `next_permutation(nums: list[int]) -> list[int]` returning a new list with the next lexicographically greater "
     "arrangement of nums. If nums is already the greatest arrangement, return it sorted ascending. Duplicates may occur.",
     r'''
import itertools, random
random.seed(6)
for _ in range(200):
    a = [random.randint(0, 3) for _ in range(random.randint(1, 6))]
    perms = sorted(set(itertools.permutations(a)))
    want = list(perms[(perms.index(tuple(a)) + 1) % len(perms)])
    assert list(next_permutation(list(a))) == want, (a, want)
'''),
    ("decode_string",
     "Write `decode_string(s: str) -> str` that expands strings of the form k[...] where k is a positive integer and the "
     "bracketed part is repeated k times; brackets can be nested. Example: '3[a2[c]]' -> 'accaccacc'.",
     r'''
for s, want in [("3[a]2[bc]", "aaabcbc"), ("3[a2[c]]", "accaccacc"), ("2[abc]3[cd]ef", "abcabccdcdcdef"), ("abc", "abc"),
                ("10[a]", "a" * 10), ("2[x3[y]z]", "xyyyzxyyyz"), ("", ""), ("a12[b]c", "a" + "b" * 12 + "c"),
                ("2[2[2[z]]]", "z" * 8), ("1[ab]", "ab")]:
    assert decode_string(s) == want, (s, decode_string(s))
'''),
    ("wildcard_match",
     "Write `wildcard_match(s: str, p: str) -> bool` that returns True if the whole string s matches pattern p, where "
     "'?' matches exactly one character and '*' matches any sequence of characters, including the empty one.",
     r'''
import fnmatch, random
random.seed(7)
for _ in range(2000):
    s = ''.join(random.choice('ab') for _ in range(random.randint(0, 8)))
    p = ''.join(random.choice('ab?*') for _ in range(random.randint(0, 6)))
    assert wildcard_match(s, p) == fnmatch.fnmatchcase(s, p), (s, p)
'''),
    ("LRUCache",
     "Write a class `LRUCache` with `__init__(self, capacity: int)`, `get(self, key: int) -> int` (return -1 if the key is "
     "absent) and `put(self, key: int, value: int) -> None`. When capacity is exceeded, evict the least recently used "
     "key; both get and put count as use. Both operations must be O(1).",
     r'''
import collections, random
random.seed(8)
for _ in range(60):
    cap = random.randint(1, 4)
    c, ref = LRUCache(cap), collections.OrderedDict()
    for _ in range(200):
        k = random.randint(0, 6)
        if random.random() < 0.5:
            got = c.get(k)
            want = ref.get(k, -1)
            if k in ref:
                ref.move_to_end(k)
            assert got == want, (cap, k, got, want)
        else:
            v = random.randint(0, 99)
            c.put(k, v)
            ref[k] = v
            ref.move_to_end(k)
            if len(ref) > cap:
                ref.popitem(last=False)
'''),
    ("edit_distance",
     "Write `edit_distance(a: str, b: str) -> int` returning the Levenshtein distance (insert, delete, substitute, each "
     "costing 1).",
     r'''
import functools, random
def _ref(a, b):
    @functools.lru_cache(None)
    def f(i, j):
        if i == 0 or j == 0:
            return i + j
        return min(f(i - 1, j) + 1, f(i, j - 1) + 1, f(i - 1, j - 1) + (a[i - 1] != b[j - 1]))
    return f(len(a), len(b))
random.seed(9)
for _ in range(400):
    a = ''.join(random.choice('abc') for _ in range(random.randint(0, 9)))
    b = ''.join(random.choice('abc') for _ in range(random.randint(0, 9)))
    assert edit_distance(a, b) == _ref(a, b), (a, b)
'''),
    ("min_meeting_rooms",
     "Write `min_meeting_rooms(intervals: list[tuple[int, int]]) -> int` returning the minimum number of rooms needed so "
     "that no two meetings in the same room overlap. Each meeting is a half-open interval [start, end), so a meeting "
     "may start exactly when another ends.",
     r'''
import random
def _ref(iv):
    return max((sum(1 for s, e in iv if s <= t < e) for t, _ in iv), default=0)
random.seed(10)
for _ in range(400):
    iv = []
    for _ in range(random.randint(0, 8)):
        s = random.randint(0, 10)
        iv.append((s, s + random.randint(1, 5)))
    assert min_meeting_rooms(iv) == _ref(iv), iv
'''),
    ("regex_match",
     "Write `regex_match(s: str, p: str) -> bool` that returns True if the whole string s matches pattern p, where '.' "
     "matches any single character and '*' means zero or more of the preceding element. Do not use the re module.",
     r'''
import random, re
random.seed(11)
for _ in range(3000):
    s = ''.join(random.choice('ab') for _ in range(random.randint(0, 7)))
    p = ''
    for _ in range(random.randint(0, 5)):
        p += random.choice('ab.')
        if random.random() < 0.4:
            p += '*'
    assert regex_match(s, p) == (re.fullmatch(p, s) is not None), (s, p)
'''),
    ("largest_rectangle",
     "Write `largest_rectangle(heights: list[int]) -> int` returning the area of the largest rectangle that fits in a "
     "histogram whose bars have the given non-negative heights and width 1. It must run in O(n).",
     r'''
import random
def _ref(h):
    return max((min(h[i:j + 1]) * (j - i + 1) for i in range(len(h)) for j in range(i, len(h))), default=0)
random.seed(12)
for _ in range(300):
    h = [random.randint(0, 7) for _ in range(random.randint(0, 14))]
    assert largest_rectangle(h) == _ref(h), h
assert largest_rectangle([1] * 200000) == 200000
assert largest_rectangle(list(range(100000))) == 2500000000
'''),
    ("sliding_median",
     "Write `sliding_median(nums: list[int], k: int) -> list[float]` returning the median of every contiguous window of "
     "size k (for even k, the mean of the two middle values). 1 <= k <= len(nums).",
     r'''
import random, statistics
random.seed(13)
for _ in range(300):
    a = [random.randint(-9, 9) for _ in range(random.randint(1, 14))]
    k = random.randint(1, len(a))
    want = [float(statistics.median(a[i:i + k])) for i in range(len(a) - k + 1)]
    got = [float(x) for x in sliding_median(a, k)]
    assert got == want, (a, k, got)
'''),
]
