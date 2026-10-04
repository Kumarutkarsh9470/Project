// v7 tiny example: copy, move, or lose it.
//   g++ -std=c++20 tiny.cpp                 compiles the working lines
//   g++ -std=c++20 -DSHOW_BUG tiny.cpp      shows the lines that can't compile
#include <iostream>
#include <memory>
#include <queue>

template <class T>
T pop_and_return(std::queue<T>& q) {
    T v = q.front();                    // a COPY: fails for unique_ptr
    q.pop();
    return v;
}

int main() {
    std::queue<std::unique_ptr<int>> q;
    q.push(std::make_unique<int>(42));
#ifdef SHOW_BUG
    std::unique_ptr<int> a = q.front(); // copy constructor is deleted
    pop_and_return(q);                  // same problem inside the template
#endif
    std::unique_ptr<int> b = std::move(q.front());
    q.pop();
    std::cout << "moved out: " << *b << '\n';

    std::queue<int> ints;
    ints.push(5);
    std::cout << "pop_and_return works for int: " << pop_and_return(ints) << '\n';
}
